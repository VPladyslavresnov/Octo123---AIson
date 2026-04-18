import type { GeneratedBlock } from "./GenerationFeed";

let blockIdCounter = 0;

function makeId(): string {
  return `block-${++blockIdCounter}-${Date.now()}`;
}

/** Desired output order */
const TYPE_ORDER: Record<string, number> = {
  "generated-video": 0,
  "generated-image": 1,
  "image-brief": 2,
  "social-post": 3,
  "caption": 4,
  "headline-options": 5,
  "hashtags": 6,
  "cta": 7,
  "campaign-summary": 8,
  "platform-adaptation": 9,
};

function sortBlocks(blocks: GeneratedBlock[]): GeneratedBlock[] {
  return [...blocks].sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
}

/**
 * Attempts to parse AI-generated text into structured content blocks.
 */
export function parseContentBlocks(rawContent: string, contentType: string): GeneratedBlock[] {
  if (contentType === "image") {
    return [{
      id: makeId(),
      type: "generated-image",
      title: "Generated Image",
      content: rawContent,
    }];
  }

  // Try to parse JSON
  if (rawContent.trim().startsWith("{") || rawContent.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(rawContent);
      return sortBlocks(jsonToBlocks(parsed));
    } catch {
      // not JSON
    }
  }

  const blocks: GeneratedBlock[] = [];

  // Extract hashtags
  const hashtagMatch = rawContent.match(/(#\w+[\s,]*){2,}/g);
  if (hashtagMatch) {
    blocks.push({
      id: makeId(),
      type: "hashtags",
      title: "Hashtags",
      content: hashtagMatch.join(" "),
    });
  }

  // Extract CTA
  const ctaPatterns = rawContent.match(/(?:CTA|Call to action)[:\s]*(.+)/i);
  if (ctaPatterns) {
    blocks.push({
      id: makeId(),
      type: "cta",
      title: "Call to Action",
      content: ctaPatterns[1].trim(),
    });
  }

  const cleanedContent = rawContent
    .replace(/(#\w+[\s,]*){2,}/g, "")
    .replace(/(?:CTA|Call to action)[:\s]*.+/i, "")
    .trim();

  if (cleanedContent) {
    const sections = cleanedContent.split(/\n{2,}/);
    if (sections.length > 2) {
      blocks.push({
        id: makeId(),
        type: "social-post",
        title: "Social Post",
        content: sections[0].trim(),
      });
      const numbered = sections.find(s => /^\d+[\.\)]/.test(s.trim()));
      if (numbered) {
        blocks.push({
          id: makeId(),
          type: "headline-options",
          title: "Headline Options",
          content: numbered.trim(),
        });
      }
    } else {
      blocks.push({
        id: makeId(),
        type: "social-post",
        title: "Social Post",
        content: cleanedContent,
      });
    }
  }

  if (blocks.length === 0) {
    return [{
      id: makeId(),
      type: "social-post",
      title: "Generated Content",
      content: rawContent,
    }];
  }

  return sortBlocks(blocks);
}

/** Create an image block from a generated image URL */
export function createImageBlock(imageUrl: string): GeneratedBlock {
  return {
    id: makeId(),
    type: "generated-image",
    title: "Generated Visual",
    content: imageUrl,
  };
}

/** Create a video block from a blob URL */
export function createVideoBlock(videoUrl: string): GeneratedBlock {
  return {
    id: makeId(),
    type: "generated-video",
    title: "Generated Video",
    content: videoUrl,
  };
}

function jsonToBlocks(data: any): GeneratedBlock[] {
  const blocks: GeneratedBlock[] = [];

  if (data.caption || data.post || data.content || data.text) {
    blocks.push({
      id: makeId(),
      type: "social-post",
      title: data.platform ? `${data.platform} Post` : "Social Post",
      platform: data.platform,
      content: data.caption || data.post || data.content || data.text,
    });
  }

  if (data.headlines && Array.isArray(data.headlines)) {
    blocks.push({
      id: makeId(),
      type: "headline-options",
      title: "Headline Options",
      content: data.headlines.map((h: string, i: number) => `${i + 1}. ${h}`).join("\n"),
    });
  }

  if (data.hashtags) {
    const tags = Array.isArray(data.hashtags) ? data.hashtags.join(" ") : data.hashtags;
    blocks.push({
      id: makeId(),
      type: "hashtags",
      title: "Hashtags",
      content: tags,
    });
  }

  if (data.cta || data.call_to_action) {
    blocks.push({
      id: makeId(),
      type: "cta",
      title: "Call to Action",
      content: data.cta || data.call_to_action,
    });
  }

  if (data.image_brief || data.visual_description || data.image_prompt) {
    blocks.push({
      id: makeId(),
      type: "image-brief",
      title: "Visual Brief",
      content: data.image_brief || data.visual_description || data.image_prompt,
    });
  }

  if (data.platform_versions && typeof data.platform_versions === "object") {
    for (const [platform, content] of Object.entries(data.platform_versions)) {
      blocks.push({
        id: makeId(),
        type: "platform-adaptation",
        platform,
        title: `${platform} Version`,
        content: typeof content === "string" ? content : JSON.stringify(content, null, 2),
      });
    }
  }

  if (data.posts && Array.isArray(data.posts)) {
    for (const post of data.posts) {
      blocks.push(...jsonToBlocks(post));
    }
  }

  if (blocks.length === 0) {
    blocks.push({
      id: makeId(),
      type: "social-post",
      title: "Generated Content",
      content: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    });
  }

  return blocks;
}
