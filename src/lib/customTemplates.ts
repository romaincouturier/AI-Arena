import type { Template } from "./types";

const STORAGE_KEY = "ai-arena-custom-templates";
const MAX_TEMPLATES = 20;

export interface CustomTemplate extends Template {
  isCustom: true;
  createdAt: string;
}

export function getCustomTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomTemplate[];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: Omit<CustomTemplate, "isCustom" | "createdAt">): CustomTemplate {
  const templates = getCustomTemplates();
  const entry: CustomTemplate = {
    ...template,
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
  // Replace if same id already exists
  const existingIndex = templates.findIndex((t) => t.id === entry.id);
  if (existingIndex >= 0) {
    templates[existingIndex] = entry;
  } else {
    templates.unshift(entry);
    if (templates.length > MAX_TEMPLATES) templates.length = MAX_TEMPLATES;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  return entry;
}

export function deleteCustomTemplate(id: string): void {
  const templates = getCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}
