import fs from "node:fs";

const target = "node_modules/whatsapp-web.js/src/util/Injected/Utils.js";
let source = fs.readFileSync(target, "utf8");

function replaceOnce(label, before, after) {
  if (!source.includes(before)) {
    throw new Error(`Patch do whatsapp-web.js não pôde ser aplicado (${label}): trecho esperado não encontrado.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  "sendMessage",
  `        return window
            .require('WAWebCollections')
            .Msg.get(newMsgKey._serialized);`,
  `        const sentMsgId =
            newMsgKey._serialized ??
            newMsgKey.$1 ??
            (typeof newMsgKey.toString === 'function'
                ? newMsgKey.toString()
                : undefined);

        return window.require('WAWebCollections').Msg.get(sentMsgId);`,
);

replaceOnce(
  "normalizeSerialized helper",
  `exports.LoadUtils = () => {
    window.WWebJS = {};`,
  `exports.LoadUtils = () => {
    window.WWebJS = {};

    window.WWebJS.normalizeSerialized = (obj, depth = 0) => {
        if (!obj || typeof obj !== 'object' || depth > 8) return obj;
        if (Array.isArray(obj)) {
            for (const item of obj) {
                window.WWebJS.normalizeSerialized(item, depth + 1);
            }
            return obj;
        }
        if (obj.$1 !== undefined && obj._serialized === undefined) {
            obj._serialized = obj.$1;
        }
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (value && typeof value === 'object') {
                window.WWebJS.normalizeSerialized(value, depth + 1);
            }
        }
        return obj;
    };`,
);

replaceOnce(
  "getMessageModel",
  `        delete msg.pendingAckUpdate;

        return msg;`,
  `        delete msg.pendingAckUpdate;

        return window.WWebJS.normalizeSerialized(msg);`,
);

fs.writeFileSync(target, source);
console.log("Patches de compatibilidade com IDs $1 do WhatsApp Web aplicados.");
