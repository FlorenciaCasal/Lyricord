export function appendExtractedSongContent(currentContent: string, extractedText: string) {
  if (!extractedText.trim()) return currentContent;
  if (!currentContent) return extractedText;
  return `${currentContent}\n\n${extractedText}`;
}
