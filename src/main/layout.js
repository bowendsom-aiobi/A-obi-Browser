'use strict';

const GEOM = {
  SIDEBAR_W: 248,
  GAP: 10,
  RADIUS: 14,
  GRIP_W: 8,
  CHAT_MIN: 300,
  CHAT_MAX: 720,
  CHAT_DEFAULT: 400,
  FIND_W: 340,
  FIND_H: 52,
  TRAFFIC: { x: 18, y: 22 },
};

function findRect(content) {
  return {
    x: Math.max(content.x, content.x + content.width - GEOM.FIND_W - 14),
    y: content.y + 12,
    width: GEOM.FIND_W,
    height: GEOM.FIND_H,
  };
}

function clampChat(width) {
  return Math.max(GEOM.CHAT_MIN, Math.min(GEOM.CHAT_MAX, Math.round(width)));
}

function compute(bounds, opts = {}) {
  const w = bounds.width;
  const h = bounds.height;
  const sw = opts.sidebarCollapsed ? 0 : GEOM.SIDEBAR_W;
  const left = sw ? sw + GEOM.GAP : GEOM.GAP;
  const sidebar = { x: 0, y: 0, width: sw, height: h };

  if (!opts.chatOpen) {
    return {
      sidebar,
      content: {
        x: left,
        y: GEOM.GAP,
        width: Math.max(0, w - left - GEOM.GAP),
        height: Math.max(0, h - GEOM.GAP * 2),
      },
      chatBody: null,
      grip: null,
    };
  }

  const cw = clampChat(opts.chatWidth || GEOM.CHAT_DEFAULT);
  const cx = w - cw;
  const innerH = Math.max(0, h - GEOM.GAP * 2);

  const grip = { x: cx - GEOM.GRIP_W, y: GEOM.GAP, width: GEOM.GRIP_W, height: innerH };
  const chatBody = {
    x: cx,
    y: GEOM.GAP,
    width: Math.max(0, cw - GEOM.GAP),
    height: innerH,
  };
  const content = {
    x: left,
    y: GEOM.GAP,
    width: Math.max(0, cx - GEOM.GRIP_W - left),
    height: innerH,
  };

  return { sidebar, content, chatBody, grip };
}

module.exports = { GEOM, compute, clampChat, findRect };
