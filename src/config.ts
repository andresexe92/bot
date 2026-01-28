import { createProvider, MemoryDB as BotDatabase } from '@builderbot/bot';
import { BaileysProvider as BotProvider } from '@builderbot/provider-baileys';

const name = 'NOMBRE_DE_LA_EMPRESA';



const adapterProvider = createProvider(BotProvider, {
        name,
        experimentalStore: true, // Significantly reduces resource consumption
        experimentalSyncMessage: 'Ups tu mensaje no pudo ser leído, por favor reenviado de nuevo',
    });

const adapterDB = new BotDatabase();

export {
    adapterDB,
    adapterProvider,
    BotDatabase,
    BotProvider
}