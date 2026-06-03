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
 */

const EXPO_PUSH_URL = "https://exp.host/--/exponent-push-notification/send";
const BATCH_SIZE = 100;

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
 * Send one batch (up to 100 messages) to the Expo Push API.
 *
 * @param {Array<{to: string, title: string, body: string, data?: object, sound?: string, priority?: string}>} messages
 * @returns {Promise<{successCount: number, errorCount: number}>}
 */
async function sendBatch(messages) {
  let successCount = 0;
  let errorCount = 0;

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

    if (!response.ok) {
      console.error("[ExpoPush] HTTP error:", response.status, response.statusText);
      return { successCount: 0, errorCount: messages.length };
    }

    const result = await response.json();
    const tickets = result?.data ?? [];

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
  } catch (err) {
    console.error("[ExpoPush] Fetch failed:", err.message);
    return { successCount: 0, errorCount: messages.length };
  }

  return { successCount, errorCount };
}

/**
 * Send a push notification to a list of Expo push tokens.
 * Automatically batches into groups of 100.
 *
 * @param {string[]} tokens          - Array of ExponentPushToken strings
 * @param {{title: string, body: string, data?: object}} payload
 * @returns {Promise<{successCount: number, errorCount: number, skippedCount: number}>}
 */
async function sendPushNotifications(tokens, payload) {
  const validTokens = tokens.filter(isValidExpoToken);
  const skippedCount = tokens.length - validTokens.length;

  if (validTokens.length === 0) {
    return { successCount: 0, errorCount: 0, skippedCount };
  }

  const messages = validTokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: "default",
    priority: "high",
    channelId: "default",
  }));

  let successCount = 0;
  let errorCount = 0;

  // Chunk into batches of BATCH_SIZE and run in parallel
  const batches = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    batches.push(messages.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(batches.map(sendBatch));

  for (const r of results) {
    successCount += r.successCount;
    errorCount += r.errorCount;
  }

  return { successCount, errorCount, skippedCount };
}

module.exports = { sendPushNotifications, isValidExpoToken };
