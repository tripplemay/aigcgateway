export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TextMessage {
  role: MessageRole;
  content: string;
  name?: string;
}

export interface MultimodalMessage {
  role: "user";
  content: ContentPart[];
}

export type ContentPart = TextPart | ImagePart;

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
}

export interface ToolMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export type Message = TextMessage | MultimodalMessage | ToolMessage;

export interface ChatParams {
  model: string;
  messages: Message[];
  stream?: false;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: { type: "json_object" | "text" };
  tools?: ToolDefinition[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  seed?: number;
  template_id?: string;
  variables?: Record<string, string>;
}

export interface ChatStreamParams extends Omit<ChatParams, "stream"> {
  stream: true;
}

export interface ImageParams {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  response_format?: "url" | "b64_json";
}

export interface ModelsParams {
  modality?: "text" | "image";
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}
