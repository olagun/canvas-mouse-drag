"use strict";

const DEBUG = false;

const lerp = (a, b, t) => a * (1 - t) + b * t;

const clamp = (v, min, max) => Math.min(Math.max(min, v), max);

const mapRange = (a0, a1, b0, b1, t) => ((t - a0) * (b1 - b0)) / (a1 - a0) + b0;

const el = element => {
  class Element {
    constructor(el) {
      this.el = typeof el == "string" ? document.querySelector(el) : el;
      this.bounds = this.el.getBoundingClientRect();
      this.transform = {
        x: 0,
        y: 0,
        z: 0,
        rotate: 0,
        scaleX: 1,
        scaleY: 1
      };
      window.addEventListener("resize", this._handleResize.bind(this));
    }

    _handleResize() {
      this.bounds = this.el.getBoundingClientRect();
    }

    style(property, value) {
      this.el.style.setProperty(property, value);
      return this;
    }

    bottom() {
      return this.bounds.bottom;
    }

    top() {
      return this.bounds.top;
    }

    height() {
      return this.bounds.height;
    }

    width() {
      return this.bounds.width;
    }

    addTransform({ x = 0, y = 0, z = 0, rotate = 0, scaleX = 0, scaleY = 0 }) {
      this.setTransform({
        x: x + this.transform.x,
        y: y + this.transform.y,
        z: z + this.transform.z,
        rotate: rotate + this.transform.rotate,
        scaleX: scaleX + this.transform.scaleX,
        scaleY: scaleY + this.transform.scaleY
      });

      return this;
    }

    setTransform({
      x = this.transform.x,
      y = this.transform.y,
      z = this.transform.z,
      rotate = this.transform.rotate,
      scaleX = this.transform.scaleX,
      scaleY = this.transform.scaleY
    }) {
      this.transform.x = x;
      this.transform.y = y;
      this.transform.z = z;
      this.transform.rotate = rotate;
      this.transform.scaleX = scaleX;
      this.transform.scaleY = scaleY;

      this.el.style.transform = `rotate(${this.transform.rotate}deg) scaleX(${
        this.transform.scaleX
      }) scaleY(${this.transform.scaleY}) translate3d(${this.transform.x}px, ${
        this.transform.y
      }px, ${this.transform.z}px)`;

      return this;
    }
  }

  return new Element(element);
};

const scroll = ({ el: scrollElement, friction = 0.5 }) => {
  let paused = false;
  const parallaxCallbacks = [];
  const easing = 1 - friction;
  const scrollState = { currentY: 0, targetY: 0 };
  const sizeState = { maxY: 0, windowHeight: 0 };

  scrollElement = el(scrollElement).style("will-change", "transform");

  const tick = () => {
    if (!paused) {
      requestAnimationFrame(tick);
    }

    scrollState.currentY = lerp(
      scrollState.currentY,
      scrollState.targetY,
      easing
    );

    scrollElement.setTransform({ y: -scrollState.currentY });
    parallaxCallbacks.forEach(callback => callback(scrollState.currentY));
  };

  const scrollTo = targetY => {
    scrollState.targetY = targetY;
  };

  const setScroll = deltaY => {
    scrollState.targetY = Math.min(
      Math.max(0, scrollState.targetY + deltaY),
      sizeState.maxY
    );
  };

  const handleResize = () => {
    sizeState.windowHeight = window.innerHeight;

    sizeState.maxY =
      scrollElement.height() > sizeState.windowHeight
        ? Math.ceil(scrollElement.height() - sizeState.windowHeight)
        : 0;
  };

  const handleWheel = e => {
    if (!paused) {
      setScroll(e.deltaY);
    }
  };

  window.addEventListener("wheel", handleWheel);
  window.addEventListener("resize", handleResize);

  handleResize();
  tick();

  return {
    start: () => {
      paused = false;
      tick();
    },
    pause: () => (paused = true),
    maxY: () => sizeState.maxY,
    windowHeight: () => sizeState.windowHeight,
    scrollState: () => scrollState,
    sizeState: () => sizeState,
    scrollTo,
    setScroll,
    track(
      element,
      scrollCallback,
      parallaxDomain,
      scrollDomain,
      clampValue = false
    ) {
      element = el(element).style("will-change", "transform");

      const resolveValue = arg => (arg instanceof Function ? arg() : arg || 0);

      const parallaxCallback = scrollY => {
        const [parallaxStart, parallaxEnd] = parallaxDomain.map(resolveValue);
        const parallaxDiff = parallaxEnd - parallaxStart;

        const [scrollStart, scrollEnd] = scrollDomain
          ? scrollDomain.map(resolveValue)
          : [
              Math.max(0, element.top() - sizeState.windowHeight),
              element.bottom() + parallaxDiff
            ];

        let parallaxValue = mapRange(
          scrollStart,
          scrollEnd,
          parallaxStart,
          parallaxEnd,
          scrollY
        );
        let normalizedValue = mapRange(scrollStart, scrollEnd, 0, 1, scrollY);

        if (clampValue) {
          parallaxValue = clamp(parallaxValue, parallaxStart, parallaxEnd);
          normalizedValue = clamp(normalizedValue, 0, 1);
        }

        scrollCallback(element, parallaxValue, normalizedValue);
      };

      parallaxCallback(scrollState.currentY);
      parallaxCallbacks.push(parallaxCallback);
    }
  };
};

function canvasMouse({ el, r, color = [0, 0, 0] }) {
  let mouseIsPressed = false;
  const dragCbs = [];
  const direction = { up: true, down: true };
  const triangleGutter = [8, 24];
  const radiusScale = 0.7;
  const size = { w: 0, h: 0 };
  const animationCache = {};
  let lastPos = { x: 0, y: 0 };
  const animations = {
    pos: { curr: { x: 0, y: 0 }, target: { x: 0, y: 0 }, ease: 0.15 },
    opacity: { curr: 0, target: 0, ease: 0.2 },
    radius: { curr: 1, target: 1, ease: 0.1 },
    triangle: {
      curr: { up: 1, down: 1 },
      target: { up: 1, down: 1 },
      ease: 0.1
    },
    press: { curr: 0, target: 1, ease: 0.2 }
  };

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  const ctx = canvas.getContext("2d");

  function dist({ x1, y1, x2, y2 }) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  function rad(deg) {
    return (deg * Math.PI) / 180;
  }

  function rotate({ x: originX, y: originY }, points, angle) {
    const sin = Math.sin(rad(angle));
    const cos = Math.cos(rad(angle));

    return points.map(([x, y]) => {
      x = x - originX;
      y = y - originY;

      const newX = x * cos - y * sin;
      const newY = x * sin + y * cos;

      return [newX + originX, newY + originY];
    });
  }

  function triangle({ x = 0, y = 0, r = 10, opacity = 1, rotation = 0 }) {
    const halfSideLength = r * Math.cos(rad(30));
    const verticalLength = r * Math.sin(rad(30));

    if (DEBUG) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, rad(360));
      ctx.stroke();
      ctx.closePath();
    }

    const points = [
      [x, y - r],
      [x + halfSideLength, y + verticalLength],
      [x - halfSideLength, y + verticalLength]
    ];

    const [[x1, y1], [x2, y2], [x3, y3]] = rotate({ x, y }, points, rotation);

    ctx.fillStyle = `rgba(${color.join(",")}, ${opacity})`;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();

    ctx.fill();
  }

  function vectorDiff(a, b) {
    return Object.keys(a).reduce((newVector, key) => {
      newVector[key] = a[key] - b[key];
      return newVector;
    }, {});
  }

  function animate() {
    const { pos, radius, opacity, triangle: tri } = animations;
    if (mouseIsPressed) {
      dragCbs.forEach(cb => {
        const vDiff = vectorDiff(pos.target, lastPos);
        cb(vDiff);
      });
    }

    ctx.globalAlpha = opacity.curr;
    const currRadius = r * lerp(radiusScale, 1, radius.curr);

    triangle({
      x: pos.curr.x,
      y:
        pos.curr.y -
        currRadius -
        lerp(triangleGutter[0], triangleGutter[1], tri.curr.up),
      r: 3,
      opacity: lerp(1, 0, tri.curr.up)
    });

    triangle({
      x: pos.curr.x,
      y:
        pos.curr.y +
        currRadius +
        lerp(triangleGutter[0], triangleGutter[1], tri.curr.down),
      r: 3,
      opacity: lerp(1, 0, tri.curr.down),
      rotation: 180
    });
    circle({ x: pos.curr.x, y: pos.curr.y, r: currRadius });
  }

  function loop() {
    requestAnimationFrame(loop);
    updateAnimation(animations);
    clearCanvas();
    animate();
  }

  function updateAnimation(animations) {
    const animationKeys = Object.keys(animations);
    animationKeys.forEach(animationKey => {
      const animation = animations[animationKey];
      const keys = Object.keys(animation.curr);
      const ease = animation.ease || 0.5;

      if (keys.length) {
        keys.forEach(key => {
          if (!animationCache[animationKey]) {
            animationCache[animationKey] = { curr: {}, target: {} };
          }

          animationCache[animationKey].curr[key] = animation.curr[key];
          animationCache[animationKey].target[key] = animation.target[key];

          animation.curr[key] = lerp(
            animation.curr[key],
            animation.target[key],
            ease
          );
        });
      } else {
        animationCache[animationKey] = {
          curr: animation.curr,
          target: animation.target
        };
        animation.curr = lerp(animation.curr, animation.target, ease);
      }
    });
  }

  function lerp(a, b, t) {
    return a * (1 - t) + b * t;
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, size.w, size.h);
  }

  function resize() {
    size.w = window.innerWidth;
    size.h = window.innerHeight;

    const ratio = window.devicePixelRatio;
    canvas.width = size.w * ratio;
    canvas.height = size.h * ratio;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.scale(ratio, ratio);
  }

  function circle({ x, y, r, p = 1, opacity = 1 }) {
    ctx.strokeStyle = `rgba(${color.join(",")}, ${opacity})`;
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.arc(x, y, r, -Math.PI / 2, p * (2 * Math.PI) - Math.PI / 2);
    ctx.stroke();
    ctx.closePath();
  }

  function mouseEnter() {
    const { opacity } = animations;
    opacity.target = 1;
  }

  function mouseLeave() {
    const { opacity } = animations;
    opacity.target = 0;
  }

  function mouseDown() {
    mouseIsPressed = true;
    lastPos = Object.assign({}, animations.pos.target);
    const { radius, triangle } = animations;
    radius.target = 0;

    if (direction.up) triangle.target.up = 0;
    if (direction.down) triangle.target.down = 0;

    window.addEventListener("mouseup", mouseUp);
  }

  function mouseMove(e) {
    const { pos } = animations;

    pos.target.x = e.pageX;
    pos.target.y = e.pageY;
  }

  function mouseUp() {
    mouseIsPressed = false;
    const { radius, triangle } = animations;
    radius.target = 1;

    if (direction.up) triangle.target.up = 1;
    if (direction.down) triangle.target.down = 1;

    window.removeEventListener("mouseup", mouseUp);
  }

  resize();
  loop();
  window.addEventListener("resize", resize);
  window.addEventListener("mouseout", mouseLeave);
  window.addEventListener("mouseover", mouseEnter);
  window.addEventListener("mousemove", mouseMove);
  window.addEventListener("mousedown", mouseDown);
  el.appendChild(canvas);

  return {
    onDrag: cb => {
      dragCbs.push(cb);
    },
    removeDrag: cb => {
      const index = dragCbs.indexOf(cb);
      if (index > 0) {
        return dragCbs.splice(index, 1);
      }
      return null;
    },
    direction: dir => {
      const { triangle, radius } = animations;
      direction.up = true;
      direction.down = true;

      if (dir > 0) {
        direction.up = true;
        direction.down = false;
        triangle.target.down = 1;
      } else if (dir < 0) {
        direction.up = false;
        direction.down = true;
        triangle.target.up = 1;
      } else {
        triangle.target.up = radius.target;
        triangle.target.down = radius.target;
      }
    }
  };
}

const hex2rgb = e =>
  e
    .match(/\#(.{2})(.{2})(.{2})/)
    .slice(1)
    .map(e => parseInt(e, 16));

const mouse = canvasMouse({
  el: document.body,
  r: 24,
  color: hex2rgb(
    getComputedStyle(document.body).getPropertyValue("--main-color")
  )
});

const scroller = scroll({
  el: ".js-s",
  friction: 0.9
});

scroller.track(
  ".p-bar",
  (element, value) => {
    element.setTransform({ y: -value });
  },
  [scroller.windowHeight, 0],
  [0, scroller.maxY]
);

scroller.track(
  "#coding",
  (element, value, p) => {
    element.setTransform({ x: value });
  },
  [0, 500]
);

scroller.track(
  "#creative",
  (element, value) => {
    element.setTransform({ x: value });
  },
  [0, 200]
);

const dragSpeed = 0.1;
// parallax hook for x, y
const code = el("#coding");

mouse.onDrag(({ y }) => {
  scroller.setScroll(-y * dragSpeed);
});

// scroller.pause();

// setTimeout(() => {
//   scroller.start();
// }, 4000);
