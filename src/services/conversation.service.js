const { ConversationState } = require('@prisma/client');
const prisma = require('../lib/prisma');

const get = (phone) => prisma.conversation.findUnique({ where: { phone } });

/** Record the id of the message being processed (webhook de-duplication). */
const touch = (phone, messageId) =>
  prisma.conversation.upsert({
    where: { phone },
    update: { lastMessageId: messageId },
    create: { phone, lastMessageId: messageId, state: ConversationState.IDLE, data: {} },
  });

const save = (phone, { state, data }) =>
  prisma.conversation.upsert({
    where: { phone },
    update: { state, data },
    create: { phone, state, data },
  });

const reset = (phone) => save(phone, { state: ConversationState.IDLE, data: {} });

/** A conversation is expired when it is mid-flow and has been idle too long. */
function isExpired(conversation, timeoutMinutes, now = Date.now()) {
  return now - new Date(conversation.updatedAt).getTime() > timeoutMinutes * 60 * 1000;
}

module.exports = { get, touch, save, reset, isExpired };
