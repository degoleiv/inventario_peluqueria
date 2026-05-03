import fs from "node:fs";
const p = "src/styles/bridge-design-system.css";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const out = [];

for (let i = 0; i < lines.length; i++) {
  const a = lines[i];
  const b = lines[i + 1];
  const c = lines[i + 2];
  if (!b || !c) {
    out.push(a);
    continue;
  }

  const mA = /^body\.theme-default(\s+.+),$/.exec(a);
  const mC = /^body\.theme-girly(\s+.+)\s*\{\s*$/.exec(c);
  if (
    mA &&
    mC &&
    b === `body.theme-neon${mA[1]},` &&
    !c.includes("body.theme-purple")
  ) {
    const inner = mA[1];
    out.push(
      `body.theme-default${inner},`,
      `body.theme-neon${inner},`,
      `body.theme-girly${inner},`,
      `body.theme-purple${inner},`,
      `body.theme-ocean${inner},`,
      `body.theme-slate${inner} {`
    );
    i += 2;
    continue;
  }

  const mComma = /^body\.theme-girly(\s+.+),$/.exec(c);
  if (
    mA &&
    mComma &&
    b === `body.theme-neon${mA[1]},` &&
    !c.includes("body.theme-purple")
  ) {
    const inner = mA[1];
    out.push(
      `body.theme-default${inner},`,
      `body.theme-neon${inner},`,
      `body.theme-girly${inner},`,
      `body.theme-purple${inner},`,
      `body.theme-ocean${inner},`,
      `body.theme-slate${inner}`
    );
    i += 2;
    continue;
  }

  out.push(a);
}

const s = out.join("\n");
fs.writeFileSync(p, s);
console.log("purple refs", (s.match(/body\.theme-purple/g) || []).length);
