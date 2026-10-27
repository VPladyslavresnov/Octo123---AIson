export const assistantVoiceOptions = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type AssistantVoiceOption = (typeof assistantVoiceOptions)[number];

export const DEFAULT_ASSISTANT_VOICE: AssistantVoiceOption = "coral";
export const DEFAULT_ASSISTANT_VOICE_SPEED = 0.96;
