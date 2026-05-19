// Raw WebGL fullscreen shader — zero dependencies (no three.js).
// An elegant, slow, white-and-violet flowing field. Subtle, cinematic,
// never overpowering the white. Respects prefers-reduced-motion, caps DPR,
// and pauses when the tab is hidden.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

// soft value noise
float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 q){
  vec2 i = floor(q), f = fract(q);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 q){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(q); q *= 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = (gl_FragCoord.xy - 0.5*u_res.xy) / min(u_res.x, u_res.y);
  float t = u_time * 0.035;

  // domain-warped flow
  vec2 q = vec2(fbm(p*1.4 + vec2(0.0, t)), fbm(p*1.4 + vec2(5.2, -t)));
  float f = fbm(p*1.6 + 1.7*q + vec2(t*0.5, -t*0.3));

  vec3 white  = vec3(1.0);
  vec3 violet = vec3(0.486, 0.361, 1.0);   // Aïobi #7C5CFF
  vec3 mist   = vec3(0.949, 0.937, 0.992); // #F2EFFD

  vec3 col = mix(white, mist, smoothstep(0.2, 0.9, f));
  col = mix(col, violet, smoothstep(0.62, 0.98, f) * 0.55);

  // gentle vignette toward pure white at the edges so content stays readable
  float vig = smoothstep(1.15, 0.25, length(p));
  col = mix(white, col, vig * 0.9);

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

export function initShader(canvas) {
  const reduce =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl =
    canvas.getContext('webgl', { antialias: true, alpha: false }) ||
    canvas.getContext('experimental-webgl');
  if (!gl || reduce) {
    canvas.classList.add('shader-fallback');
    return { stop() {} };
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  let raf = 0;
  let running = true;
  const start = performance.now();
  function frame(now) {
    if (!running) return;
    resize();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      raf = requestAnimationFrame(frame);
    }
  });

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
