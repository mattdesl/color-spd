/**
 * Catmull-Rom "getPoint" function taken from ThreeJS.
 */

function vec3Dist(a, b) {
  return Math.sqrt(vec3DistSq(a, b));
}
function vec3DistSq(a, b) {
  var x = b[0] - a[0],
    y = b[1] - a[1],
    z = b[2] - a[2];
  return x * x + y * y + z * z;
}
function vec3Add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}
function vec3Sub(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

export function CatmullRomSpline(points = [], opts = {}) {
  const {
    closed = false,
    type = "uniform",
    tension = 0.5,
    arcLengthDivisions = 200,
  } = opts;

  const spline = {
    closed,
    type,
    tension,
    points,
    arcLengthDivisions,
    getArcLengths,
    getPoints,
    getPoint,
    getSpacedPoint,
    getUtoTMapping,
  };

  return spline;

  function getPoints(n, spaced) {
    const arclengths = getArcLengths();
    const paths = [];
    for (let i = 0; i < n; i++) {
      const t = spline.closed ? i / n : i / (n - 1);
      const p = spaced ? getSpacedPoint(t, null, arclengths) : getPoint(t);
      paths.push(p);
    }
    return paths;
  }

  function getPoint(t, out) {
    return getCatmullRomPoint(spline, t, out);
  }

  function getSpacedPoint(u, out, arcLengths) {
    let t = getUtoTMapping(u, null, arcLengths);
    return getPoint(t, out);
  }

  function getUtoTMapping(u, distance, arcLengths) {
    arcLengths = arcLengths || getArcLengths();

    var i = 0,
      il = arcLengths.length;

    var targetArcLength; // The targeted u distance value to get

    if (distance != null) {
      targetArcLength = distance;
    } else {
      targetArcLength = u * arcLengths[il - 1];
    }

    // binary search for the index with largest value smaller than target u distance

    var low = 0,
      high = il - 1,
      comparison;

    while (low <= high) {
      i = Math.floor(low + (high - low) / 2); // less likely to overflow, though probably not issue here, JS doesn't really have integers, all numbers are floats

      comparison = arcLengths[i] - targetArcLength;

      if (comparison < 0) {
        low = i + 1;
      } else if (comparison > 0) {
        high = i - 1;
      } else {
        high = i;
        break;

        // DONE
      }
    }

    i = high;

    if (arcLengths[i] === targetArcLength) {
      return i / (il - 1);
    }

    // we could get finer grain at lengths, or use simple interpolation between two points

    var lengthBefore = arcLengths[i];
    var lengthAfter = arcLengths[i + 1];

    var segmentLength = lengthAfter - lengthBefore;

    // determine where we are between the 'before' and 'after' points

    var segmentFraction = (targetArcLength - lengthBefore) / segmentLength;

    // add that fractional amount to t

    var t = (i + segmentFraction) / (il - 1);

    return t;
  }

  function getArcLengths(divisions) {
    divisions = divisions || spline.arcLengthDivisions;
    var out = [];
    var current;
    var last = getPoint(0);
    var p;
    var sum = 0;

    out.push(0);

    for (p = 1; p <= divisions; p++) {
      current = getPoint(p / divisions);
      sum += vec3Dist(current, last);
      out.push(sum);
      last = current;
    }

    return out;
  }
}

export const CurveType = {
  Uniform: "uniform",
  Centripetal: "centripetal",
  Chordal: "chordal",
};

/*
 Based on an optimized c++ solution in
  - http://stackoverflow.com/questions/9489736/catmull-rom-curve-with-no-cusps-and-no-self-intersections/
  - http://ideone.com/NoEbVM
 This CubicPoly class could be used for reusing some variables and calculations,
 but for three.js curve use, it could be possible inlined and flatten into a single function call
 which can be placed in CurveUtils.
 */
function CubicPoly() {
  let c0 = 0,
    c1 = 0,
    c2 = 0,
    c3 = 0;

  /*
   * Compute coefficients for a cubic polynomial
   *   p(s) = c0 + c1*s + c2*s^2 + c3*s^3
   * such that
   *   p(0) = x0, p(1) = x1
   *  and
   *   p'(0) = t0, p'(1) = t1.
   */
  function init(x0, x1, t0, t1) {
    c0 = x0;
    c1 = t0;
    c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1;
    c3 = 2 * x0 - 2 * x1 + t0 + t1;
  }

  return {
    initCatmullRom: function (x0, x1, x2, x3, tension) {
      init(x1, x2, tension * (x2 - x0), tension * (x3 - x1));
    },

    initNonuniformCatmullRom: function (x0, x1, x2, x3, dt0, dt1, dt2) {
      // compute tangents when parameterized in [t1,t2]
      let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
      let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;

      // rescale tangents for parametrization in [0,1]
      t1 *= dt1;
      t2 *= dt1;

      init(x1, x2, t1, t2);
    },

    calc: function (t) {
      let t2 = t * t;
      let t3 = t2 * t;
      return c0 + c1 * t + c2 * t2 + c3 * t3;
    },
  };
}

const tmp1 = [];
const tmp2 = [];
const px = new CubicPoly();
const py = new CubicPoly();
const pz = new CubicPoly();

export function getCatmullRomPoint(opts, t, out) {
  opts = opts || {};
  out = out || [];

  if (Array.isArray(opts)) {
    opts = { points: opts };
  }

  const { closed = false, type = "uniform", tension = 0.5 } = opts;

  const points = opts.points || [];

  const l = points.length;
  const p = (l - (closed ? 0 : 1)) * t;
  let intPoint = Math.floor(p);
  let weight = p - intPoint;

  if (closed) {
    intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
  } else if (weight === 0 && intPoint === l - 1) {
    intPoint = l - 2;
    weight = 1;
  }

  let p0, p1, p2, p3; // 4 points

  if (closed || intPoint > 0) {
    p0 = points[(intPoint - 1) % l];
  } else {
    // extrapolate first point
    vec3Sub(tmp1, points[0], points[1]);
    vec3Add(tmp1, tmp1, points[0]);
    p0 = tmp1;
  }

  p1 = points[intPoint % l];
  p2 = points[(intPoint + 1) % l];

  if (closed || intPoint + 2 < l) {
    p3 = points[(intPoint + 2) % l];
  } else {
    // extrapolate last point
    vec3Sub(tmp2, points[l - 1], points[l - 2]);
    vec3Add(tmp2, tmp2, points[l - 1]);
    p3 = tmp2;
  }

  if (type === "centripetal" || type === "chordal") {
    // init Centripetal / Chordal Catmull-Rom
    let pow = type === "chordal" ? 0.5 : 0.25;
    let dt0 = Math.pow(vec3DistSq(p0, p1), pow);
    let dt1 = Math.pow(vec3DistSq(p1, p2), pow);
    let dt2 = Math.pow(vec3DistSq(p2, p3), pow);

    // safety check for repeated points
    if (dt1 < 1e-4) dt1 = 1.0;
    if (dt0 < 1e-4) dt0 = dt1;
    if (dt2 < 1e-4) dt2 = dt1;

    px.initNonuniformCatmullRom(p0[0], p1[0], p2[0], p3[0], dt0, dt1, dt2);
    py.initNonuniformCatmullRom(p0[1], p1[1], p2[1], p3[1], dt0, dt1, dt2);
    pz.initNonuniformCatmullRom(p0[2], p1[2], p2[2], p3[2], dt0, dt1, dt2);
  } else if (type === "catmullrom" || type === "uniform") {
    px.initCatmullRom(p0[0], p1[0], p2[0], p3[0], tension);
    py.initCatmullRom(p0[1], p1[1], p2[1], p3[1], tension);
    pz.initCatmullRom(p0[2], p1[2], p2[2], p3[2], tension);
  }

  out[0] = px.calc(weight);
  out[1] = py.calc(weight);
  out[2] = pz.calc(weight);

  return out;
}
