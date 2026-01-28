import { addKeyword, utils, createFlow, createProvider, MemoryDB, createBot } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';

const PORT = process.env.PORT ?? 3010;
const name = 'pepita';
const flowQuestion = addKeyword(utils.setEvent('question'))
    .addAction(async (ctx, $) => {
    try {
        const body = JSON.parse(ctx.name);
        await $.state.update({ body });
        await $.flowDynamic(body.message.join('\n'));
    }
    catch (error) {
        console.log(error.message);
    }
})
    .addAction({ capture: true }, async (ctx, $) => {
    const respuesta = Number(ctx.body);
    const { answers, message } = $.state.get('body');
    if (respuesta.toString() == 'NaN') {
        await $.flowDynamic(`❌ *${ctx.body}* no es una respuesta valida ❌`);
        return $.fallBack(message.join('\n'));
    }
    for (const answer of answers) {
        const { option, action, message } = answer;
        if (option === respuesta) {
            console.log(action);
            await $.flowDynamic(message);
            break;
        }
    }
});
const main = async () => {
    const adapterFlow = createFlow([flowQuestion]);
    const adapterProvider = createProvider(BaileysProvider, {
        name,
        experimentalStore: true,
        experimentalSyncMessage: 'Ups tu mensaje no pudo ser leído, por favor reenviado de nuevo',
    });
    const adapterDB = new MemoryDB();
    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });
    adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
        const { number, message, urlMedia } = req.body;
        await bot.sendMessage(number, message, { media: urlMedia ?? null });
        return res.end('sended');
    }));
    adapterProvider.server.post('/v1/question', handleCtx(async (bot, req, res) => {
        const body = req.body;
        await bot.dispatch('question', { from: body.number, name: JSON.stringify(body) });
        return res.end('sended');
    }));
    httpServer(+PORT);
};
main();
