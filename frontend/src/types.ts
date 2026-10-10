export type Doc={id:string;path:string;name:string;version:number;size:number;status:string;engine:string;warnings:string[];block_count:number;char_count:number;duplicate_count:number;updated_at:string;blocks?:Block[]};
export type Block={id:string;ordinal:number;locator:string;kind:string;text:string;cells:string[][]};
export type Evidence={id:string;document_id:string;path:string;name:string;version:number;status:string;locator:string;text:string;kind:string;score:number;method:string;citation?:string};
export type Answer={mode:string;answer:string;evidence:Evidence[];warnings:string[]};
export type Job={id:string;state:string;total:number;done:number;items:{path:string;state:string;message:string;document_id?:string}[]};
export type Task={id:string;title:string;deadline:string;owner:string;status:string;source_id?:string;source_version?:number;current_source_version?:number;source_name?:string};
export type Proposal={title:string;deadline:string;source_id:string;source_version:number;date_candidates:{value:string;explicit:boolean;locator:string;quote:string}[];evidence:{locator:string;text:string}[];warnings:string[]};
export type Status={ai_configured:boolean;semantic_configured:boolean;semantic_error:string;ocr_languages:string[];ocr_available:boolean;ocr_config:string;pdf_ocr_available:boolean;hwp_available:boolean;docling_available:boolean;parser:string;roots:string[]};
