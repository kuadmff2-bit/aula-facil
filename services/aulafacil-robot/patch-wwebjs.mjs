import fs from "node:fs";

const target = "node_modules/whatsapp-web.js/src/util/Injected/Utils.js";
const before = `        return window
            .require('WAWebCollections')
            .Msg.get(newMsgKey._serialized);`;
const after = `        const sentMsgId =
            newMsgKey._serialized ??
            newMsgKey.$1 ??
            (typeof newMsgKey.toString === 'function'
                ? newMsgKey.toString()
                : undefined);

        return window.require('WAWebCollections').Msg.get(sentMsgId);`;

const source = fs.readFileSync(target, "utf8");
if (!source.includes(before)) {
  throw new Error("Patch do whatsapp-web.js não pôde ser aplicado: trecho esperado não encontrado.");
}
fs.writeFileSync(target, source.replace(before, after));
console.log("Patch upstream do sendMessage aplicado ao whatsapp-web.js.");
