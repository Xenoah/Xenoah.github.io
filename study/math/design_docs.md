# Design Documentation: Math Learning Site

This document outlines the architectural decisions and design patterns used in the project.

## 1. Architecture: Component-Based MPA
We chose a **Multi-Page Application (MPA)** structure without a bundler (using ES Modules directly) to satisfy the "Static Hosting" and "GitHub Pages" requirements while keeping the codebase simple and modular.

### Directory Structure
- `/shared`: Contains reusable logic (Runtime, Renderer, Params) to prevent code duplication.
- `/lessons/*`: Each lesson is self-contained with its own `index.html` and `lesson.js`.
- `index.html`: Central entry point acting as a menu.

## 2. Design System: Dark Glassmorphism
A premium aesthetic was achieved using:
- **Technique**: CSS `backdrop-filter: blur()` for glass effect.
- **Palette**: Deep space background (`#050510`) with Neon accents (Cyan `#00f0ff`, Purple `#7000ff`).
- **Typography**: Inter (UI) and JetBrains Mono (Math/Data).
- **Responsiveness**: CSS Grid and Flexbox for layout; Canvas scaling for visuals.

## 3. Shared Modules

### `ParameterManager` (params.js)
- **Goal**: Abstract the UI creation and state management.
- **Features**:
  - Auto-generates sliders, toggles, selects from a JSON Schema.
  - Handles URL serialization (state sharing) automatically.
  - Emits change events for reactive rendering.

### `LessonRuntime` (runtime.js)
- **Goal**: Manage the animation loop and standard controls.
- **Features**:
  - `requestAnimationFrame` loop with `dt` (delta time).
  - Handles Play/Pause/Reset logic.
  - **Performance**: Stops the loop when the tab is hidden (`visibilitychange`).

### `Render` (render.js)
- **Goal**: Simplify Canvas 2D operations.
- **Features**:
  - High-DPI support (handling `devicePixelRatio`).
  - Coordinate system mapping (Math coordinates -> Screen coordinates).
  - Drawing primitives (Grid, Circle, Line, Text).

## 4. Lesson Implementation details

### Trigonometry
- Uses direct mapping of `params.omega * t` to angle.
- Splits canvas into Unit Circle (Left) and Waveform history (Right).

### Factorization
- Solves quadratic equation $ax^2+bx+c=0$.
- Visualizes Complex roots simply by projecting them near the vertex when $D < 0$.

### Calculus
- **Derivative**: Visualizes the Secant line approaching the Tangent as $h \to 0$.
- **Integral**: Visualizes Riemann sums (Left/Right/Midpoint) and Trapezoidal rule.

### Fourier
- Implements a naive DFT ($O(N^2)$) which is sufficient for $N \le 512$ in JS.
- Time Domain: Generated via additive synthesis.
- Frequency Domain: Bar chart of amplitudes from DFT.

### High-Dimensions
- **tesseract**: 4D Hypercube.
- **Rotation**: Applied in 4D space (XW, YZ planes).
- **Projection**: 4D -> 3D (Perspective) -> 2D (Perspective).
