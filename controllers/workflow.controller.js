import dayjs from "dayjs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { serve } = require("@upstash/workflow/express");
import Subscription from "../models/subscription.model.js";
import { sendReminderEmail } from "../utils/send-email.js";

const REMINDERS = [7, 5, 2, 1];

export const sendReminders = serve(async (context) => {
  const { subscriptionId } = context.requestPayload;
  const subscription = await fetchSubscription(context, subscriptionId);

  if (!subscription || subscription.status !== "active") return;

  const renewalDate = dayjs(subscription.renewalDate);

  if (renewalDate.isBefore(dayjs())) {
    console.log(
      `Renewal date has passed for subscription ${subscriptionId}. Stopping workflow.`
    );
    return;
  }

  // Process reminders in descending order (farthest to closest to renewal date)
  const remindersToProcess = [...REMINDERS].sort((a, b) => b - a);
  
  // Find the next applicable reminder
  for (const daysBefore of remindersToProcess) {
    const reminderDate = renewalDate.subtract(daysBefore, "day");
    const reminderLabel = `${daysBefore} days before reminder`;
    const today = dayjs();

    // If reminder date is in the future, sleep until then
    if (reminderDate.isAfter(today)) {
      console.log(`Scheduling ${reminderLabel} for ${reminderDate.format()}`);
      await sleepUntilReminder(
        context,
        reminderLabel,
        reminderDate
      );
      
      // After waking up, trigger the reminder
      await triggerReminder(
        context,
        reminderLabel,
        subscription
      );
    } 
    // If today is the reminder date, trigger immediately
    else if (today.isSame(reminderDate, "day")) {
      console.log(`Today is the day for ${reminderLabel}`);
      await triggerReminder(
        context,
        reminderLabel,
        subscription
      );
    }
    // Skip reminders that have already passed
  }
});

const fetchSubscription = async (context, subscriptionId) => {
  return await context.run("get subscription", async () => {
    return Subscription.findById(subscriptionId).populate("user", "name email");
  });
};

const sleepUntilReminder = async (context, label, date) => {
  console.log(`Sleeping until ${label} reminder at ${date}`);
  await context.sleepUntil(label, date.toDate());
};

const triggerReminder = async (context, label, subscription) => {
  return await context.run(label, async () => {
    console.log(`Triggering ${label} reminder`);

    await sendReminderEmail({
      to: subscription.user.email,
      type: label,
      subscription,
    });
  });
};
