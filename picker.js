import { Color, colorToStyle } from "./lib/color.js";
import { clamp01, lerp } from "./lib/math.js";
import {
  CatmullRomSpline,
  CurveType,
  getCatmullRomPoint,
} from "./lib/spline.js";
import { createCanvas } from "./lib/util.js";

import * as spectra from "./lib/spectra/spectra.js";
import ColorChecker from "./lib/spectra/colorchecker.js";
import * as random from "./lib/random.js";
import simplify from "./lib/simplify.js";

const dpr = 2;
const { canvas, context, width, height } = createCanvas({
  width: 512 * dpr,
  height: 256 * dpr,
});
canvas.style.width = "";

const randomSPD = () =>
  random.pick(
    ColorChecker.filter(
      (f) =>
        f.name !== "Black" && f.name !== "White" && !f.name.includes("Neutral")
    )
  );

context.fillStyle = "black";
context.fillRect(0, 0, width, height);

const radius = 0.05;
const touchPad = 0.0075;
let currentSelectedPointIndex = -1;
let currentHoverPointIndex = -1;
let copiedTimeout;

let points = [],
  wavelengths;
setFromSPD(randomSPD().spd, true);
document
  .querySelector(".randomize")
  .addEventListener("click", () => setFromSPD(randomSPD().spd, true));
document.querySelector(".clear").addEventListener("click", () => {
  points = [[0.5, 0.5]];
});

const doCopy = async (e) => {
  e.preventDefault();
  await copy();
};
document.addEventListener("copy", doCopy);
document.querySelector(".copy").addEventListener("click", doCopy);

document.addEventListener("paste", (e) => {
  e.preventDefault();
  let text = (e.originalEvent || e).clipboardData.getData("text/plain");
  try {
    let spd;
    console.log(e);
    try {
      const c = new Color(text).to("srgb");
      c.toGamut({ space: "srgb" });
      spd = spectra.sRGB_to_spectra(c.coords.map((x) => x * 0xff));
      console.log("got color", spd);
      setFromSPD(spd, true);
    } catch (err) {
      // not a color
      spd = JSON.parse(text);
      if (!Array.isArray(spd)) throw new Error("not an array");
      if (spd.length !== spectra.WAVELENGTH_COUNT)
        throw new Error("not valid size array");
      setFromSPD(spd, true);
    }
  } catch (err) {
    console.error("could not parse wavelengths", err);
  }
});

async function copy() {
  if (!wavelengths) return;
  const spd = wavelengths.slice();
  try {
    const str = JSON.stringify(spd);
    console.log("writing to clipboard");
    await navigator.clipboard.writeText(str);
    notifyCopy();
  } catch (err) {
    console.log(err);
  }
}

function notifyCopy() {
  clearTimeout(copiedTimeout);
  document.querySelector(".copied").style.display = "";
  copiedTimeout = setTimeout(() => {
    document.querySelector(".copied").style.display = "none";
  }, 1500);
}

const distToPoint = (u, v, p) => {
  const dx = p[0] - u;
  const dy = p[1] - v;
  return Math.sqrt(dx * dx + dy * dy);
};

const insideCircle = (u, v, p, r) => {
  return distToPoint(u, v, p) <= r;
};

const closestPoint = (u, v) => {
  let minDist = Infinity;
  let pi;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const d = distToPoint(u, v, p);
    if (d < minDist) {
      minDist = d;
      pi = i;
    }
  }
  return [pi, minDist];
};

canvas.addEventListener(
  "pointerdown",
  (ev) => {
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const u = x / r.width;
    const v = y / r.height;
    const [pIndex, pDist] = closestPoint(u, v);
    if (pIndex >= 0 && pDist < radius + touchPad) {
      if (ev.shiftKey) {
        if (points.length > 1) {
          points.splice(pIndex, 1);
          currentSelectedPointIndex = -1;
          currentHoverPointIndex = -1;
        }
      } else {
        currentSelectedPointIndex = pIndex;
        currentHoverPointIndex = -1;
      }
    } else if (!ev.shiftKey) {
      currentSelectedPointIndex = points.length;
      currentHoverPointIndex = -1;
      points.push([u, v]);
    }
  },
  { passive: false }
);

window.addEventListener(
  "pointermove",
  (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const u = x / r.width;
    const v = y / r.height;

    const nm =
      u >= 0 && u <= 1 && v >= 0 && v <= 1
        ? Math.round(lerp(spectra.WAVELENGTH_MIN, spectra.WAVELENGTH_MAX, u))
        : "-";
    document.querySelector(".current-nm").textContent = `${nm} nm`;

    if (currentSelectedPointIndex >= 0) {
      const p = points[currentSelectedPointIndex];
      p[0] = clamp01(u);
      p[1] = clamp01(v);
      currentHoverPointIndex = -1;
    } else {
      const [pIndex, pDist] = closestPoint(u, v);
      if (pIndex >= 0 && pDist < radius + touchPad) {
        currentHoverPointIndex = pIndex;
      } else {
        currentHoverPointIndex = -1;
      }
    }
  },
  { passive: true }
);

window.addEventListener(
  "pointerup",
  (ev) => {
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const u = x / r.width;
    const v = y / r.height;
    currentSelectedPointIndex = -1;
    currentHoverPointIndex = -1;
  },
  { passive: false }
);

function setFromSPD(spd, isSimplify = false) {
  currentHoverPointIndex = -1;
  currentSelectedPointIndex = -1;
  wavelengths = null;
  const input = spd.map((d, i, lst) => {
    return [i / (lst.length - 1), 1 - d];
  });
  if (!isSimplify && input.length === spectra.WAVELENGTH_COUNT)
    points = input.slice();
  else points = simplify(input, 0.04);
  render();
}

function setFromControls(controlPoints) {
  currentHoverPointIndex = -1;
  currentSelectedPointIndex = -1;
  wavelengths = null;
  points = controlPoints.slice();
}

function draw() {
  requestAnimationFrame(draw);
  render();
}

function render() {
  context.clearRect(0, 0, width, height);
  if (points.length === 0) return;

  const allPoints = points.slice();
  // sort by x axis
  allPoints.sort((a, b) => {
    return a[0] - b[0];
  });

  if (allPoints[0][0] !== 0) {
    allPoints.unshift([0, allPoints[0][1]]);
  }
  const last = allPoints[allPoints.length - 1];
  if (last[0] !== 1) {
    allPoints.push([1, last[1]]);
  }

  const curve = CatmullRomSpline(
    allPoints.map((pt) => {
      return [pt[0], pt[1], 0];
    }),
    {
      tension: 0.5,
      closed: false,
      type: CurveType.Centripetal,
    }
  );

  const waveSpline = curve.getPoints(spectra.WAVELENGTH_COUNT, true);

  const points2D = curve
    .getPoints(100, true)
    .map((s) => [s[0] * width, s[1] * height]);

  wavelengths =
    points.length === spectra.WAVELENGTH_COUNT
      ? points.map((x) => 1 - x[1])
      : waveSpline.map((x) => clamp01(1 - x[1]));
  const outColor = spectra.spectra_to_sRGB(wavelengths);
  context.fillStyle = context.strokeStyle = `rgb(${outColor.join(",")})`;
  context.fillRect(0, 0, width, height);

  const foreground =
    new Color(
      "srgb",
      outColor.map((s) => s / 0xff)
    ).contrast("white", "wcag21") < 2
      ? "black"
      : "white";
  context.lineWidth = width * 0.005;
  context.strokeStyle = foreground;
  context.beginPath();
  context.lineTo(0, allPoints[0][1] * height);
  points2D.forEach((pt) => {
    context.lineTo(pt[0], pt[1]);
  });
  context.lineTo(width, last[1] * height);
  context.stroke();

  points.forEach((pt, i) => {
    const x = pt[0] * width,
      y = pt[1] * height;

    let fc = 1;

    if (currentSelectedPointIndex === i) fc = 3;
    else if (currentSelectedPointIndex === -1 && currentHoverPointIndex === i)
      fc = 1.5;
    context.lineWidth = fc * width * 0.005;

    context.strokeStyle = foreground;
    // context.globalCompositeOperation = hovering ? "exclusion" : "source-over";

    context.beginPath();
    context.arc(x, y, radius * Math.min(width, height), 0, Math.PI * 2);
    context.stroke();
    // context.globalCompositeOperation = "source-over";
  });
}

requestAnimationFrame(draw);

drawSpectrum(canvas, width);
document.body.querySelector(".canvas-container").appendChild(canvas);

function drawSpectrum(parentCanvas, w) {
  const { canvas, width, height, context } = createCanvas({
    width: w,
    height: 8,
  });
  canvas.style.width = "";
  const steps = 256;
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1);
    const outColor = spectra.wavelength_to_sRGB(lerp(380, 780, u));
    context.fillStyle = context.strokeStyle = `rgb(${outColor.join(",")})`;
    const sliceWidth = Math.round((1 / steps) * width);
    context.fillRect(sliceWidth * i, 0, sliceWidth, height);
  }
  document.body.querySelector(".canvas-container").appendChild(canvas);
}
