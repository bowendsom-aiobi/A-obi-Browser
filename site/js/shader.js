// Raw WebGL fullscreen shader — zero dependencies (no three.js).
// An elegant, slow, white-and-violet flowing field. Subtle, cinematic,
// never overpowering the white. Respects prefers-reduced-motion, caps DPR,
// and pauses when the tab is hidden.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// Adapted from the flowing-line shader: a single violet intensity (no RGB
// split = no rainbow) on near-white. Clearly visible, cinematic, elegant.
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

void main(void){
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res.xy) / min(u_res.x, u_res.y);
  float t = u_time * 0.05;
  float lineWidth = 0.0022;

  float g = 0.0;
  for(int i = 0; i < 6; i++){
    float fi = float(i);
    g += lineWidth * (fi*fi + 1.0)
       / abs(fract(t + fi*0.013) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.22));
  }
  g = pow(clamp(g, 0.0, 1.0), 0.85);

  vec3 white  = vec3(1.0);
  vec3 violet = vec3(0.486, 0.361, 1.0);   // Aïobi #7C5CFF
  vec3 col = mix(white, violet, g * 0.9);

  // ease the very centre so the title/buttons stay crisp, keep edges alive
  float calm = smoothstep(0.0, 0.65, length(uv));
  col = mix(mix(white, col, 0.35), col, calm);

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
