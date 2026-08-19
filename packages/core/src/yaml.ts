/** Small dependency-free YAML subset: nested maps, block/inline arrays, scalars and comments. */
export type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue };

export function parse(text: string): Record<string, YamlValue> {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((raw) => ({ raw, indent: raw.match(/^ */)?.[0].length ?? 0, text: raw.trim() })).filter((line) => line.text && !line.text.startsWith("#"));
  const root: Record<string, YamlValue> = {};
  const stack: Array<{ indent: number; value: Record<string, YamlValue> | YamlValue[] }> = [{ indent: -1, value: root }];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) stack.pop();
    const current = stack[stack.length - 1].value;
    if (line.text.startsWith("- ")) {
      if (Array.isArray(current)) current.push(coerce(line.text.slice(2).trim()));
      continue;
    }
    const colon = line.text.indexOf(":");
    if (colon < 0 || Array.isArray(current)) continue;
    const key = line.text.slice(0, colon).trim();
    const rest = line.text.slice(colon + 1).trim();
    if (rest) { current[key] = coerce(rest); continue; }
    const next = lines[i + 1];
    const child: Record<string, YamlValue> | YamlValue[] = next && next.indent > line.indent && next.text.startsWith("- ") ? [] : {};
    current[key] = child;
    stack.push({ indent: line.indent, value: child });
  }
  return root;
}

function coerce(value: string): YamlValue {
  const unquoted = value.replace(/^['"]|['"]$/g, "");
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  if (unquoted === "null" || unquoted === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(unquoted)) return Number(unquoted);
  if (unquoted.startsWith("[") && unquoted.endsWith("]")) return unquoted.slice(1, -1).split(",").map((item) => coerce(item.trim())).filter((item) => item !== "");
  return unquoted;
}
