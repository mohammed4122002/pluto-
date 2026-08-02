import { api } from "./client";

export type AiProviderSettings = {
  id: string;
  openai_api_key_masked: string | null;
  gemini_api_key_masked: string | null;
  gemini_model: string | null;
  updated_at: string;
};

export type AiProviderSettingsUpdate = {
  openai_api_key?: string;
  gemini_api_key?: string;
  gemini_model?: string;
};

export const getAiProviderSettings = () =>
  api.get<AiProviderSettings>("/settings/ai-providers").then((res) => res.data);

export const updateAiProviderSettings = (payload: AiProviderSettingsUpdate) =>
  api.patch<AiProviderSettings>("/settings/ai-providers", payload).then((res) => res.data);
