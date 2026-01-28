import { addKeyword, utils } from "@builderbot/bot";
import { BotDatabase, BotProvider } from "./config";
import { Body } from "./types";

// MANEJAR LAS PREGUNTAS CON OPCIONES DIFERENTES
export const flowQuestion = addKeyword<BotProvider, BotDatabase>(utils.setEvent('question'))
	

.addAction(async (ctx, $) => {
		try {
			const body = JSON.parse(ctx.name) as Body;

			await $.state.update({ body });
			await $.flowDynamic(body.message.join('\n'));
		} catch (error) {
			console.log(error.message);
		}
	})


	.addAction({ capture: true }, async (ctx, $) => {
		
		const respuesta = Number(ctx.body);

		console.log(respuesta);

		const { answers, message } = $.state.get('body') as Body;

		if (respuesta.toString() == 'NaN') {
			await $.flowDynamic(`❌ *${ctx.body}* no es una respuesta valida ❌`);
			return $.fallBack(message.join('\n'));
		}

		for (const answer of answers) {

			const { option, action, message } = answer;
			
			if (option === respuesta) {
				const data = {
					respuesta : respuesta
				}

				console.log("Apuntando a : "   +  action);
				
				const httpResponse = await fetch(action, {
					method: "POST",
					headers: {
					"Content-Type": "application/json"
					},
					body: JSON.stringify(data)
				});

				console.log("Esta es la Respuesta del servidor")
				console.log(httpResponse);

				await $.flowDynamic(message);
				break;
            }
		}
	});