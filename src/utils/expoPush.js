/**
 * Expo Push Notification utility
 *
 * Sends push messages to devices via the Expo Push API.
 * Reference: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Rules:
 *  - Max 100 messages per batch request (Expo limit).
 *  - Only sends to valid ExponentPushToken[...] tokens.
 *  - Silently skips invalid/expired tokens (DeviceNotRegistered errors).
 *  - Retries transient network/server failures up to MAX_RETRIES times with
 *    exponential backoff (1 s, 2 s, 4 s). Per-ticket application errors
 *    (e.g. DeviceNotRegistered) are NOT retried — they are permanent.
 */

const EXPO_PUSH_URL = "https://api.expo.dev/v2/push/send";
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;

/**
 * @param {string} token
 * @returns {boolean}
 */
function isValidExpoToken(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

/**
 * Wait for `ms` milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send one batch (up to 100 messages) to the Expo Push API.
 * Retries on transient network errors or 5xx responses with exponential backoff.
 *
 * @param {Array<{to: string, title: string, body: string, data?: object, sound?: string, priority?: string}>} messages
 * @returns {Promise<{successCount: number, errorCount: number}>}
 */
async function sendBatch(messages) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Exponential backoff: 0 ms on first try, 1 s, 2 s on retries
    if (attempt > 0) {
      await sleep(Math.pow(2, attempt - 1) * 1000);
      console.warn(`[ExpoPush] Retry attempt ${attempt}/${MAX_RETRIES - 1}`);
    }

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      // 5xx → transient server error, retry
      if (response.status >= 500) {
        console.warn("[ExpoPush] Server error:", response.status, response.statusText);
        continue;
      }

      // 4xx → permanent client error (malformed payload), don't retry
      if (!response.ok) {
        console.error("[ExpoPush] Client error:", response.status, response.statusText);
        return { successCount: 0, errorCount: messages.length };
      }

      const result = await response.json();
      const tickets = result?.data ?? [];

      let successCount = 0;
      let errorCount = 0;
      for (const ticket of tickets) {
        if (ticket.status === "ok") {
          successCount++;
        } else {
          errorCount++;
          if (ticket.details?.error !== "DeviceNotRegistered") {
            console.warn("[ExpoPush] Ticket error:", ticket.message, ticket.details);
          }
        }
      }
      return { successCount, errorCount };
    } catch (err) {
      // Network-level failure (DNS, connection reset, etc.) — retry
      console.warn(`[ExpoPush] Network failure (attempt ${attempt + 1}):`, err.message);
    }
  }

  // All retries exhausted
  console.error("[ExpoPush] All retry attempts failed for batch of", messages.length);
  return { successCount: 0, errorCount: messages.length };
}

/**
 * Send a push notification to a list of Expo push tokens.
 * Automatically batches into groups of 100 and runs batches in parallel.
 *
 * @param {string[]} tokens          - Array of ExponentPushToken strings
 * @param {{title: string, body: string, data?: object}} payload
 * @param {{ priority?: "default" | "high" }} [options]
 * @returns {Promise<{successCount: number, errorCount: number, skippedCount: number}>}
 */
async function sendPushNotifications(tokens, payload, options = {}) {
  const validTokens = tokens.filter(isValidExpoToken);
  const skippedCount = tokens.length - validTokens.length;

  if (validTokens.length === 0) {
    return { successCount: 0, errorCount: 0, skippedCount };
  }

  const pushPriority = options.priority ?? "high";

  const messages = validTokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: "default",
    priority: pushPriority,
    channelId: "default",
  }));

  // Chunk into batches of BATCH_SIZE and run in parallel
  const batches = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    batches.push(messages.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(batches.map(sendBatch));

  let successCount = 0;
  let errorCount = 0;
  for (const r of results) {
    successCount += r.successCount;
    errorCount += r.errorCount;
  }

  return { successCount, errorCount, skippedCount };
}

module.exports = { sendPushNotifications, isValidExpoToken };
