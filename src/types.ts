// INTERFACES PARA TIPADO DE LOS DATOS QUE MANEJAN LOS ENDPOINTS 
export interface Answers {
	option: number;
	action: string;
	message: string;
}

export interface Body {
	number: string;
	urlMedia: string;
	message: string[];
	answers: Answers[];
}
