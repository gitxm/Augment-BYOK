export type SseEvent = { event?: string; data: string };

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      yield line.endsWith("\r") ? line.slice(0, -1) : line;
    }
  }
  buf += decoder.decode();
  if (buf) yield buf;
}

export async function* parseSse(resp: Response): AsyncGenerator<SseEvent> {
  if (!resp.body) return;
  let dataLines: string[] = [];
  let event: string | undefined;
  for await (const line of readLines(resp.body)) {
    if (line === "") {
      if (dataLines.length > 0) {
        yield { event, data: dataLines.join("\n") };
        dataLines = [];
        event = undefined;
      }
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    else if (line.startsWith("event:")) event = line.slice(6).trimStart();
  }
  if (dataLines.length > 0) yield { event, data: dataLines.join("\n") };
}

