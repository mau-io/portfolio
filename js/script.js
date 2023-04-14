import * as PIXI from "https://cdn.skypack.dev/pixi.js@5.x";
import {
  KawaseBlurFilter
} from "https://cdn.skypack.dev/@pixi/filter-kawase-blur@3.2.0";
import SimplexNoise from "https://cdn.skypack.dev/simplex-noise@3.0.0";
// expected hue range: [0, 360)
// expected saturation range: [0, 1]
// expected lightness range: [0, 1]
// based on algorithm from http://en.wikipedia.org/wiki/HSL_and_HSV#Converting_to_RGB
function hslToRgb(hue, saturation, lightness) {
  if (hue === undefined) {
    return [0, 0, 0];
  }

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [red1, green1, blue1] =
    huePrime >= 5
      ? [chroma, 0, x]
      : huePrime >= 4
      ? [x, 0, chroma]
      : huePrime >= 3
      ? [0, x, chroma]
      : huePrime >= 2
      ? [0, chroma, x]
      : huePrime >= 1
      ? [x, chroma, 0]
      : [chroma, x, 0];

  const lightnessAdjustment = lightness - chroma / 2;
  const [red, green, blue] = [
    red1 + lightnessAdjustment,
    green1 + lightnessAdjustment,
    blue1 + lightnessAdjustment,
  ];

  return [
    Math.abs(Math.round(red * 255)),
    Math.abs(Math.round(green * 255)),
    Math.abs(Math.round(blue * 255)),
  ];
}

// Now let's define an API for our module, we're taking hue, saturation and luminosity values and outputting a CSS compatible hex string.
// Hue is in degrees, between 0 and 359. Since degrees a cyclical in nature, we'll support numbers greater than 359 or less than 0 by "spinning" them around until they fall within the 0 to 359 range.
// Saturation and luminosity are both percentages, we'll represent these percentages with whole numbers between 0 and 100. For these numbers we'll need to enforce a maximum and a minimum, anything below 0 will become 0, anything above 100 will become 100.
// Let's write some utility functions to handle this logic:

function max(val, n) {
  return (val > n) ? n : val
}

function min(val, n) {
  return (val < n) ? n : val
}

function cycle(val) {
  // for safety:
  val = max(val, 1e7)
  val = min(val, -1e7)
  // cycle value:
  while (val < 0) {
    val += 360
  }
  while (val > 359) {
    val -= 360
  }
  return val
}

// Now for the main piece, the `hsl` function:
function hsl(hue, saturation, luminosity) {
  // resolve degrees to 0 - 359 range
  hue = cycle(hue)

  // enforce constraints
  saturation = min(max(saturation, 100), 0)
  luminosity = min(max(luminosity, 100), 0)

  // convert to 0 to 1 range used by hsl-to-rgb-for-reals
  saturation /= 100
  luminosity /= 100

  // let hsl-to-rgb-for-reals do the hard work
  var rgb = hslToRgb(hue, saturation, luminosity)

  // convert each value in the returned RGB array
  // to a 2 character hex value, join the array into
  // a string, prefixed with a hash
  return '#' + rgb
    .map(function (n) {
      return (256 + n).toString(16).substr(-2)
    })
    .join('')
}

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
  var timeout;
  return function () {
    var context = this,
      args = arguments;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

const OrbApp = (() => {
  const simplex = new SimplexNoise();
  // Utility functions
  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function map(n, start1, end1, start2, end2) {
    return ((n - start1) / (end1 - start1)) * (end2 - start2) + start2;
  }

  // ColorPalette class
  class ColorPalette {
    constructor() {
      this.setColors();
      this.setCustomProperties();
    }

    setColors() {
      // pick a random hue somewhere between 220 and 360
      this.hue = ~~random(220, 360);
      this.complimentaryHue1 = this.hue + 30;
      this.complimentaryHue2 = this.hue + 60;
      // define a fixed saturation and lightness
      this.saturation = 95;
      this.lightness = 50;

      // define a base color
      this.baseColor = hsl(this.hue, this.saturation, this.lightness);
      // define a complimentary color, 30 degress away from the base
      this.complimentaryColor1 = hsl(
        this.complimentaryHue1,
        this.saturation,
        this.lightness
      );
      // define a second complimentary color, 60 degrees away from the base
      this.complimentaryColor2 = hsl(
        this.complimentaryHue2,
        this.saturation,
        this.lightness
      );

      // store the color choices in an array so that a random one can be picked later
      this.colorChoices = [
        this.baseColor,
        this.complimentaryColor1,
        this.complimentaryColor2
      ];
    }

    randomColor() {
      // pick a random color
      return this.colorChoices[~~random(0, this.colorChoices.length)].replace(
        "#",
        "0x"
      );
    }

    setCustomProperties() {
      // set CSS custom properties so that the colors defined here can be used throughout the UI
      document.documentElement.style.setProperty("--hue", this.hue);
      document.documentElement.style.setProperty(
        "--hue-complimentary1",
        this.complimentaryHue1
      );
      document.documentElement.style.setProperty(
        "--hue-complimentary2",
        this.complimentaryHue2
      );
    }
  }

  // Orb class
  class Orb {
    // Pixi takes hex colors as hexidecimal literals (0x rather than a string with '#')
    constructor(fill = 0x000000, size, speed = 0.002) {
      // bounds = the area an orb is "allowed" to move within
      this.bounds = this.setBounds();
      // initialise the orb's { x, y } values to a random point within it's bounds
      this.x = random(this.bounds["x"].min, this.bounds["x"].max);
      this.y = random(this.bounds["y"].min, this.bounds["y"].max);

      // how large the orb is vs it's original radius (this will modulate over time)
      this.scale = 1;

      // what color is the orb?
      this.fill = fill;

      // the original radius of the orb, set relative to window height
      //this.radius = random(window.innerHeight / 6, window.innerHeight / 6);
      this.radius = size;
      // starting points in "time" for the noise/self similar random values
      this.xOff = random(0, 1000);
      this.yOff = random(0, 1000);
      // how quickly the noise/self similar random values step through time
      this.inc = speed;

      // PIXI.Graphics is used to draw 2d primitives (in this case a circle) to the canvas
      this.graphics = new PIXI.Graphics();
      this.graphics.alpha = 0.825;

      // 250ms after the last window resize event, recalculate orb positions.
      window.addEventListener(
        "resize",
        debounce(() => {
          this.bounds = this.setBounds();
        }, 250)
      );
    }

    setBounds() {
      // how far from the { x, y } origin can each orb move
      const maxDist =
        window.innerWidth < 1000 ? window.innerWidth / 3 : window.innerWidth / 5;
      // the { x, y } origin for each orb (the bottom right of the screen)
      const originX = window.innerWidth / 1.25;
      const originY =
        window.innerWidth < 1000 ?
        window.innerHeight :
        window.innerHeight / 1.375;

        return {
          x: {
            min: 0,
            max: window.innerWidth
          },
          y: {
            min: 0,
            max: window.innerHeight
          }
        };
      // allow each orb to move x distance away from it's x / y origin
      return {
        x: {
          min: originX - maxDist,
          max: originX + maxDist
        },
        y: {
          min: originY - maxDist,
          max: originY + maxDist
        }
      };
    }

    update() {
      // self similar "psuedo-random" or noise values at a given point in "time"
      const xNoise = simplex.noise2D(this.xOff, this.xOff);
      const yNoise = simplex.noise2D(this.yOff, this.yOff);
      const scaleNoise = simplex.noise2D(this.xOff, this.yOff);

      // map the xNoise/yNoise values (between -1 and 1) to a point within the orb's bounds
      this.x = map(xNoise, -1, 1, this.bounds["x"].min, this.bounds["x"].max);
      this.y = map(yNoise, -1, 1, this.bounds["y"].min, this.bounds["y"].max);
      // map scaleNoise (between -1 and 1) to a scale value somewhere between half of the orb's original size, and 100% of it's original size
      this.scale = map(scaleNoise, -1, 1, 0.5, 1);

      // step through "time"
      this.xOff += this.inc;
      this.yOff += this.inc;
    }

    render() {
      // update the PIXI.Graphics position and scale values
      this.graphics.x = this.x;
      this.graphics.y = this.y;
      this.graphics.scale.set(this.scale);

      // clear anything currently drawn to graphics
      this.graphics.clear();

      // tell graphics to fill any shapes drawn after this with the orb's fill color
      this.graphics.beginFill(this.fill);
      // draw a circle at { 0, 0 } with it's size set by this.radius
      this.graphics.drawCircle(0, 0, this.radius);
      // let graphics know we won't be filling in any more shapes
      this.graphics.endFill();
    }
  }

  function init() {
    const numberOfOrbs = 4;
    // Create PixiJS app
    const app = new PIXI.Application({
      // render to <canvas class="orb-canvas"></canvas>
      view: document.querySelector(".orb-canvas"),
      // auto adjust size to fit the current window
      resizeTo: window,
      // transparent background, we will be creating a gradient background later using CSS
      transparent: true
    });

    app.stage.filters = [new KawaseBlurFilter(30, 20, true)];

    // Create colour palette
    const colorPalette = new ColorPalette();

    // Create orbs
    const orbs = [];

    for (let i = 0; i < numberOfOrbs; i++) {
      const size = random(window.innerHeight/ 3, window.innerHeight / 6);
      const speed = random(0.001, 0.003); // Define la velocidad deseada para cada orbe (puedes ajustar los valores mínimo y máximo)
      const orb = new Orb(colorPalette.randomColor(), size, speed);
      app.stage.addChild(orb.graphics);
      orbs.push(orb);
    }

    // Animate!
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      app.ticker.add(() => {
        orbs.forEach((orb) => {
          orb.update();
          orb.render();
        });
      });
    } else {
      orbs.forEach((orb) => {
        orb.update();
        orb.render();
      });
    }

    document
      .querySelector(".overlay__btn--colors")
      .addEventListener("click", () => {
        colorPalette.setColors();
        colorPalette.setCustomProperties();

        orbs.forEach((orb) => {
          orb.fill = colorPalette.randomColor();
          orb.radius = random(window.innerHeight/ 3, window.innerHeight / 6);
        });
      });
  }

  return {
    init: init,
  };
})();

// Initialize the OrbApp
OrbApp.init();