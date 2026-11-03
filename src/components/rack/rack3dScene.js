import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getStatusHexColor } from '@/utils/objectUtils'

// Field names mirror the legacy client's Rack3DWidget Scene/Unit DTO.

// Metres
const U = 0.04445 // 1U = 44.45 mm
const RACK_W = 0.48 // 19" usable mounting width
const RACK_D = 0.7 // internal rack depth (front-to-back)
const PARTIAL_DEPTH = 0.5 // fraction of rack depth used by a FRONT- or REAR-only element
// +Z is the front of the rack (default camera vantage point)

const DEVICE_COLOR = 0x808080
const EDGE_COLOR = 0x3a3a3a // dark edge outline, so adjacent boxes stay distinct

const STATUS_WARNING = 1
const STATUS_CRITICAL = 4

// Warning-triangle marker based on the Lucide "triangle-alert" icon.
const TRIANGLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" ' +
  'fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" ' +
  'fill="{FILL}" stroke="{STROKE}"/>' +
  '<path d="M12 9v4" stroke="{STROKE}"/>' +
  '<path d="M12 17h.01" stroke="{STROKE}"/>' +
  '</svg>'

const ORIENTATION_TO_SIDE = { full: 'FILL', front: 'FRONT', back: 'REAR' }
const PASSIVE_TYPE_TO_3D = {
  PatchPanel: 'PATCH_PANEL',
  FilterPanel: 'FILLER_PANEL',
  Organizer: 'ORGANISER',
  PDU: 'PDU',
}
const PASSIVE_STATUS_COLOR = '#808080'

/**
 * @param {Array} elements
 * @param {{ rackHeight: number, topBottomNumbering: boolean }} rackMeta
 * @param {Object} resolvedImages - Map<guid, dataUrl>
 * @param {{ bgColor: string, fgColor: string }} theme
 */
export function buildSceneData(
  elements,
  { rackHeight, topBottomNumbering },
  resolvedImages,
  theme,
) {
  return {
    height: rackHeight,
    topBottomNumbering: !!topBottomNumbering,
    bgColor: theme?.bgColor ?? '#2b2b2b',
    fgColor: theme?.fgColor ?? '#e0e0e0',
    units: elements.map((el) => ({
      id: el.id,
      name: el.label || el.objectName || el.passiveType || '',
      position: el.slot,
      height: el.heightU,
      side: ORIENTATION_TO_SIDE[el.orientation] ?? 'FILL',
      statusColor: el.passiveType ? PASSIVE_STATUS_COLOR : getStatusHexColor(el.objectStatus ?? 5),
      frontImage: el.frontImageGuid ? (resolvedImages[el.frontImageGuid] ?? null) : null,
      rearImage: el.backImageGuid ? (resolvedImages[el.backImageGuid] ?? null) : null,
      passive: !!el.passiveType,
      type: el.passiveType ? (PASSIVE_TYPE_TO_3D[el.passiveType] ?? null) : null,
      status: el.objectStatus ?? 0,
    })),
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onSelect?: (elementId: number|string|null) => void }} [options]
 * @returns {{ setData: Function, setSelection: Function, resetCamera: Function, dispose: Function }}
 */
export function createSceneController(canvas, options = {}) {
  const onSelect = options.onSelect ?? (() => {})

  let themeBg = '#2b2b2b'
  let themeFg = '#e0e0e0'

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio || 1)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(themeBg)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const key = new THREE.DirectionalLight(0xffffff, 0.6)
  key.position.set(1, 2, 2)
  scene.add(key)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  let rackGroup = null
  let pickable = []
  let selectedMesh = null
  let sceneData = null
  let animationFrame = null

  function applyTheme(data) {
    if (data.bgColor) themeBg = data.bgColor
    if (data.fgColor) themeFg = data.fgColor
    scene.background = new THREE.Color(themeBg)
    renderer.setClearColor(new THREE.Color(themeBg), 1)
  }

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z(front), -Z(back).
  function boxMaterials(faceColor, frontTex, rearTex) {
    const plain = new THREE.MeshLambertMaterial({ color: new THREE.Color(faceColor) })
    const front = frontTex ? new THREE.MeshLambertMaterial({ map: frontTex }) : plain
    const rear = rearTex ? new THREE.MeshLambertMaterial({ map: rearTex }) : plain
    return [plain, plain, plain, plain, front, rear]
  }

  // Y of the centre of a unit. `position` is already bottom-based (1 = bottom row).
  function unitCenterY(u) {
    const bottomEdge = (u.position - 1) * U
    return bottomEdge + (u.height * U) / 2
  }

  // Z of the centre of an element so it sits flush with the correct end of the
  // rack (+Z front, -Z rear); FILL is centred.
  function unitCenterZ(side, depth) {
    if (side === 'FRONT') return RACK_D / 2 - depth / 2
    if (side === 'REAR') return -RACK_D / 2 + depth / 2
    return 0
  }

  function unitDepth(u) {
    if (u.passive) {
      switch (u.type) {
        case 'FILLER_PANEL':
          return 0.015
        case 'PATCH_PANEL':
          return 0.04
        case 'ORGANISER':
          return 0.06
        case 'PDU':
          return 0.1
        default:
          return 0.04
      }
    }
    return u.side === 'FILL' ? RACK_D : RACK_D * PARTIAL_DEPTH
  }

  // Front and back are left open.
  function drawRackEnclosure(heightU) {
    const h = heightU * U
    const EW = RACK_W + 0.05
    const ED = RACK_D + 0.05

    const box = new THREE.BoxGeometry(EW, h, ED)
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: new THREE.Color(themeFg) }),
    )
    edges.position.set(0, h / 2, 0)
    rackGroup.add(edges)

    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x8fa3b8,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    })

    function addPanel(geo, x, y, z, axis, angle) {
      const m = new THREE.Mesh(geo, panelMat)
      if (axis === 'y') m.rotation.y = angle
      else if (axis === 'x') m.rotation.x = angle
      m.position.set(x, y, z)
      rackGroup.add(m)
    }

    addPanel(new THREE.PlaneGeometry(ED, h), -EW / 2, h / 2, 0, 'y', Math.PI / 2)
    addPanel(new THREE.PlaneGeometry(ED, h), EW / 2, h / 2, 0, 'y', Math.PI / 2)
    addPanel(new THREE.PlaneGeometry(EW, ED), 0, h, 0, 'x', -Math.PI / 2)
    addPanel(new THREE.PlaneGeometry(EW, ED), 0, 0, 0, 'x', -Math.PI / 2)
  }

  function applySelectionVisual(mesh) {
    const ud = mesh.userData
    const accent = ud.unit.passive ? new THREE.Color(themeFg) : new THREE.Color(ud.unit.statusColor)

    ud.edges.material.color.copy(ud.selected ? accent : new THREE.Color(EDGE_COLOR))

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if (mat.emissive) {
        mat.emissive.copy(
          ud.selected ? accent.clone().multiplyScalar(0.4) : new THREE.Color(0x000000),
        )
      }
    }
  }

  function makeLabelSprite(text, opts = {}) {
    const fontSize = opts.fontSize || 44
    const pad = opts.pad !== undefined ? opts.pad : 10
    const statusColor = opts.statusColor || null
    const bg = opts.bg !== undefined ? opts.bg : 'rgba(15,15,15,0.78)'
    const fg = opts.fg || '#ffffff'
    const barW = statusColor ? 12 : 0

    const canvasEl = document.createElement('canvas')
    const ctx = canvasEl.getContext('2d')
    const font = `bold ${fontSize}px sans-serif`
    ctx.font = font
    const textW = Math.ceil(ctx.measureText(text).width)
    canvasEl.width = textW + pad * 2 + barW
    canvasEl.height = fontSize + pad * 2

    ctx.font = font
    ctx.textBaseline = 'middle'
    if (bg) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height)
    }
    if (statusColor) {
      ctx.fillStyle = statusColor
      ctx.fillRect(0, 0, barW, canvasEl.height)
    }
    ctx.fillStyle = fg
    ctx.fillText(text, barW + pad, canvasEl.height / 2)

    const tex = new THREE.CanvasTexture(canvasEl)
    tex.minFilter = THREE.LinearFilter

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
    const worldH = opts.worldHeight || 0.05
    sprite.scale.set(worldH * (canvasEl.width / canvasEl.height), worldH, 1)
    return sprite
  }

  function makeTriangleSprite(colorHex) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }))
    const wh = U * 1.4
    sprite.scale.set(wh, wh, 1)

    const svg = TRIANGLE_SVG.replace('{FILL}', colorHex).replace(/\{STROKE\}/g, themeFg)
    const img = new Image()
    img.onload = () => {
      const size = 256
      const canvasEl = document.createElement('canvas')
      canvasEl.width = size
      canvasEl.height = size
      canvasEl.getContext('2d').drawImage(img, 0, 0, size, size)
      const tex = new THREE.CanvasTexture(canvasEl)
      tex.minFilter = THREE.LinearMipmapLinearFilter
      sprite.material.map = tex
      sprite.material.needsUpdate = true
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    return sprite
  }

  // Floating severity marker on the right rail for abnormal devices.
  function addStatusMarker(u) {
    const s = makeTriangleSprite(u.statusColor)
    s.position.set(RACK_W / 2 + 0.05, unitCenterY(u), RACK_D / 2)
    rackGroup.add(s)
  }

  function addUnit(u) {
    const h = u.height * U
    const depth = unitDepth(u)
    const geo = new THREE.BoxGeometry(RACK_W, h, depth)

    const mesh = new THREE.Mesh(geo, boxMaterials(DEVICE_COLOR, null, null))

    // A FILL passive panel is a front-mounted faceplate.
    const placement = u.passive && u.side === 'FILL' ? 'FRONT' : u.side
    mesh.position.set(0, unitCenterY(u), unitCenterZ(placement, depth))
    mesh.userData.objectId = u.id
    mesh.userData.passive = u.passive
    mesh.userData.unit = u
    mesh.userData.selected = false

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR }),
    )
    mesh.add(edges)
    mesh.userData.edges = edges

    rackGroup.add(mesh)
    pickable.push(mesh)

    // FILL elements can carry both images; FRONT/REAR only the matching one.
    let frontTex = null
    let rearTex = null
    const applyTextures = () => {
      mesh.material = boxMaterials(DEVICE_COLOR, frontTex, rearTex)
      applySelectionVisual(mesh)
    }

    if ((u.side === 'FRONT' || u.side === 'FILL') && u.frontImage) {
      new THREE.TextureLoader().load(u.frontImage, (t) => {
        frontTex = t
        applyTextures()
      })
    }
    if ((u.side === 'REAR' || u.side === 'FILL') && u.rearImage) {
      new THREE.TextureLoader().load(u.rearImage, (t) => {
        rearTex = t
        applyTextures()
      })
    }

    if (!u.passive && u.status >= STATUS_WARNING && u.status <= STATUS_CRITICAL) {
      addStatusMarker(u)
    }
  }

  // Y of the centre of the physical slot labeled n
  function unitNumberY(n, data) {
    const fromBottom = data.topBottomNumbering ? data.height - n + 1 : n
    return (fromBottom - 1) * U + U / 2
  }

  function addUnitNumbers(data) {
    for (let n = 1; n <= data.height; n++) {
      const s = makeLabelSprite(String(n), {
        fontSize: 40,
        pad: 4,
        bg: null,
        fg: themeFg,
        worldHeight: U * 0.62,
      })
      s.position.set(-(RACK_W / 2 + 0.06), unitNumberY(n, data), RACK_D / 2)
      rackGroup.add(s)
    }
  }

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const mat of mats) {
          if (mat.map) mat.map.dispose()
          mat.dispose()
        }
      }
    })
  }

  function frameCamera(heightU) {
    const h = heightU * U
    camera.position.set(RACK_W * 1.5, h * 0.6, RACK_D + h * 0.9)
    controls.target.set(0, h / 2, 0)
    controls.update()
  }

  function buildScene(data) {
    applyTheme(data)

    if (rackGroup !== null) {
      scene.remove(rackGroup)
      disposeGroup(rackGroup)
    }
    rackGroup = new THREE.Group()
    pickable = []
    selectedMesh = null

    drawRackEnclosure(data.height)
    addUnitNumbers(data)
    for (const unit of data.units) addUnit(unit)

    scene.add(rackGroup)
    frameCamera(data.height)
  }

  function applySelection(mesh) {
    if (selectedMesh !== null && selectedMesh !== mesh) {
      selectedMesh.userData.selected = false
      applySelectionVisual(selectedMesh)
    }
    selectedMesh = mesh
    if (mesh !== null) {
      mesh.userData.selected = true
      applySelectionVisual(mesh)
    }
  }

  function onClick(ev) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(pickable, false)
    const hit = hits.length > 0 ? hits[0].object : null
    onSelect(hit ? hit.userData.objectId : null)
    applySelection(hit)
  }

  function resizeToContainer() {
    const w = canvas.parentElement?.clientWidth ?? 0
    const h = canvas.parentElement?.clientHeight ?? 0
    if (w <= 0 || h <= 0) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  function animate() {
    animationFrame = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }

  canvas.addEventListener('click', onClick)
  const resizeObserver = new ResizeObserver(resizeToContainer)
  resizeObserver.observe(canvas.parentElement)

  resizeToContainer()
  animate()

  return {
    setData(data) {
      sceneData = data
      buildScene(sceneData)
    },
    setSelection(elementId) {
      const mesh = pickable.find((m) => m.userData.objectId === elementId) ?? null
      applySelection(mesh)
    },
    resetCamera() {
      if (sceneData) frameCamera(sceneData.height)
    },
    dispose() {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      canvas.removeEventListener('click', onClick)
      controls.dispose()
      if (rackGroup !== null) disposeGroup(rackGroup)
      renderer.dispose()
    },
  }
}
