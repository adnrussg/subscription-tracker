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
    console.log(`Renewal date has passed for subscription ${subscriptionId}. Stopping workflow.`);
    return;
  }

  // Process each reminder sequentially
  await processReminder(context, subscription, renewalDate, 0);
});

// Process reminders one at a time in sequence
const processReminder = async (context, subscription, renewalDate, index) => {
  if (index >= REMINDERS.length) return;
  
  const daysBefore = REMINDERS[index];
  const reminderDate = renewalDate.subtract(daysBefore, "day");
  const reminderLabel = `${daysBefore} days before reminder`;

  // If reminder date is in future, sleep until then
  if (reminderDate.isAfter(dayjs())) {
    await sleepUntilReminder(context, `Reminder ${daysBefore} days before`, reminderDate);
  }

  // When we wake up or if it's due today, trigger the reminder
  if (dayjs().isSame(reminderDate, "day")) {
    await triggerReminder(context, reminderLabel, subscription);
  }

  // Process next reminder
  await processReminder(context, subscription, renewalDate, index + 1);
};

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
