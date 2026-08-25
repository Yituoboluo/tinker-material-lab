import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Volume2, VolumeX } from 'lucide-react'
import {
  Bodies,
  Body,
  Composite,
  Engine,
  Events,
  Mouse,
  MouseConstraint,
  Runner,
  Vector,
} from 'matter-js'
import type { IEventCollision } from 'matter-js'
import './App.css'
import { soundEngine } from './sound'

type MaterialId = 'steel' | 'rubber' | 'glass' | 'gravity'
type Point = { x: number; y: number }
type Dimensions = { width: number; height: number; dpr: number }
type BallVisual = {
  material: MaterialId
  radius: number
  color: string
  highlight: string
}
type BallEffect = { squash: number; crack: number; glow: number }
type Shockwave = { x: number; y: number; radius: number; life: number; color: string }
type Spark = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
  color: string
}
type RailVisual = { body: Body; width: number; height: number; color: string }
type RailDrag = {
  rail: RailVisual
  mode: 'move' | 'rotate'
  offset: Point
}

const materialOrder: MaterialId[] = ['steel', 'rubber', 'glass', 'gravity']

const materials: Record<MaterialId, {
  name: string
  code: string
  color: string
  highlight: string
  radius: number
  density: number
  restitution: number
  friction: number
  frictionAir: number
  magnetism: number
}> = {
  steel: {
    name: '钢', code: 'FE', color: '#315efb', highlight: '#d9e6ff', radius: 23,
    density: 0.0042, restitution: 0.58, friction: 0.1, frictionAir: 0.006, magnetism: 1,
  },
  rubber: {
    name: '橡胶', code: 'RB', color: '#ff5b57', highlight: '#ffd0bd', radius: 29,
    density: 0.0011, restitution: 0.94, friction: 0.72, frictionAir: 0.009, magnetism: 0,
  },
  glass: {
    name: '玻璃', code: 'GL', color: '#7de0ec', highlight: '#ffffff', radius: 25,
    density: 0.0017, restitution: 0.76, friction: 0.04, frictionAir: 0.003, magnetism: 0,
  },
  gravity: {
    name: '重力', code: 'GR', color: '#1e2633', highlight: '#8d98a8', radius: 35,
    density: 0.012, restitution: 0.18, friction: 0.34, frictionAir: 0.012, magnetism: 0.16,
  },
}

const initialCounts: Record<MaterialId, number> = { steel: 6, rubber: 5, glass: 4, gravity: 2 }

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const spawnBallRef = useRef<(material: MaterialId) => void>(() => undefined)
  const polarityRef = useRef<1 | -1>(1)
  const fieldStrengthRef = useRef(0.68)
  const mutedRef = useRef(false)
  const drawerTimerRef = useRef<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [polarity, setPolarity] = useState<1 | -1>(1)
  const [fieldStrength, setFieldStrength] = useState(0.68)
  const [counts, setCounts] = useState<Record<MaterialId, number>>({ ...initialCounts })
  const [worldKey, setWorldKey] = useState(0)

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    fieldStrengthRef.current = fieldStrength
  }, [fieldStrength])

  useEffect(() => {
    drawerTimerRef.current = window.setTimeout(() => setDrawerOpen(false), 4200)
    return () => {
      if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current)
    }
  }, [])

  function cancelDrawerClose() {
    if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current)
    drawerTimerRef.current = null
  }

  function scheduleDrawerClose(delay = 2800) {
    cancelDrawerClose()
    drawerTimerRef.current = window.setTimeout(() => setDrawerOpen(false), delay)
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const stage = stageRef.current!
    const context = canvas.getContext('2d')!
    const engine = Engine.create({
      gravity: { x: 0, y: 0.5 },
      enableSleeping: true,
    })
    const runner = Runner.create()
    const dimensions: Dimensions = { width: 0, height: 0, dpr: 1 }
    const visuals = new Map<number, BallVisual>()
    const effects = new Map<number, BallEffect>()
    const balls: Body[] = []
    const shockwaves: Shockwave[] = []
    const sparks: Spark[] = []
    let boundaries: Body[] = []
    let rails: RailVisual[] = []
    let steelLinks: Array<[Body, Body]> = []
    let animationFrame = 0
    let destroyed = false
    let lastImpactAt = 0
    let lastGravityFlipAt = 0

    const magnet = Bodies.circle(0, 0, 50, {
      label: 'magnet',
      restitution: 0.32,
      friction: 0.12,
      frictionAir: 0.035,
      density: 0.006,
    })

    function createStatics(width: number, height: number) {
      Composite.remove(engine.world, [...boundaries, ...rails.map((rail) => rail.body)])
      boundaries = [
        Bodies.rectangle(width / 2, height + 34, width + 160, 80, { isStatic: true, label: 'floor' }),
        Bodies.rectangle(width / 2, -44, width + 160, 80, { isStatic: true, label: 'ceiling' }),
        Bodies.rectangle(-34, height / 2, 80, height + 160, { isStatic: true, label: 'wall' }),
        Bodies.rectangle(width + 34, height / 2, 80, height + 160, { isStatic: true, label: 'wall' }),
      ]

      const railWidth = Math.min(220, width * 0.3)
      const railData = [
        { x: width - railWidth * 0.42, y: height * 0.31, angle: -0.42, color: '#b6ef4a' },
        { x: width - railWidth * 0.58, y: height * 0.53, angle: 0.36, color: '#9d72ff' },
        { x: width - railWidth * 0.34, y: height * 0.72, angle: -0.28, color: '#ffca3a' },
      ]
      rails = railData.map((rail, index) => ({
        body: Bodies.rectangle(rail.x, rail.y, railWidth, 18, {
          isStatic: true,
          label: `bumper-${index}`,
          angle: rail.angle,
          restitution: 1.08,
          friction: 0.02,
          chamfer: { radius: 9 },
        }),
        width: railWidth,
        height: 18,
        color: rail.color,
      }))
      Composite.add(engine.world, [...boundaries, ...rails.map((rail) => rail.body)])
    }

    function resize() {
      const bounds = stage.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dimensions.width = bounds.width
      dimensions.height = bounds.height
      dimensions.dpr = dpr
      canvas.width = Math.round(bounds.width * dpr)
      canvas.height = Math.round(bounds.height * dpr)
      canvas.style.width = `${bounds.width}px`
      canvas.style.height = `${bounds.height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      createStatics(bounds.width, bounds.height)
    }

    resize()
    Body.setPosition(magnet, { x: dimensions.width * 0.52, y: dimensions.height * 0.48 })
    Composite.add(engine.world, magnet)

    function createBall(material: MaterialId, position?: Point, announce = true) {
      const config = materials[material]
      const radiusFactor = material === 'glass'
        ? 0.78 + Math.random() * 0.42
        : 0.9 + Math.random() * 0.17
      const radius = config.radius * radiusFactor
      const body = Bodies.circle(
        position?.x ?? Math.min(245, dimensions.width * 0.3),
        position?.y ?? 135 + materialOrder.indexOf(material) * 72,
        radius,
        {
          label: `ball-${material}`,
          restitution: config.restitution,
          friction: config.friction,
          frictionAir: config.frictionAir,
          density: config.density,
        },
      )
      visuals.set(body.id, {
        material,
        radius,
        color: config.color,
        highlight: config.highlight,
      })
      effects.set(body.id, { squash: 0, crack: 0, glow: 0 })
      balls.push(body)
      Composite.add(engine.world, body)
      Body.setVelocity(body, { x: 2.4 + Math.random() * 1.8, y: -1.6 - Math.random() })
      if (announce) {
        setCounts((current) => ({ ...current, [material]: current[material] + 1 }))
        if (!mutedRef.current) soundEngine.launch(material)
      }
      return body
    }

    let initialIndex = 0
    for (const material of materialOrder) {
      for (let index = 0; index < initialCounts[material]; index += 1) {
        const column = initialIndex % 6
        const row = Math.floor(initialIndex / 6)
        createBall(material, {
          x: dimensions.width * 0.28 + column * Math.min(72, dimensions.width * 0.075),
          y: 125 + row * 78,
        }, false)
        initialIndex += 1
      }
    }
    spawnBallRef.current = (material) => createBall(material)

    const mouse = Mouse.create(canvas)
    mouse.pixelRatio = dimensions.dpr
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.19,
        damping: 0.1,
        render: { visible: false },
      },
    })
    Composite.add(engine.world, mouseConstraint)

    function applyMagnetism() {
      const strength = fieldStrengthRef.current
      const range = 190 + strength * 310
      steelLinks = []
      for (const ball of balls) {
        const visual = visuals.get(ball.id)
        if (!visual) continue
        const magneticResponse = materials[visual.material].magnetism
        if (magneticResponse === 0) continue
        const delta = Vector.sub(magnet.position, ball.position)
        const distance = Vector.magnitude(delta)
        const contactDeadZone = 50 + visual.radius + 7
        if (distance < contactDeadZone || distance > range) continue
        const falloff = Math.pow(1 - distance / range, 1.5)
        const force = Vector.mult(
          Vector.normalise(delta),
          ball.mass * 0.00115 * strength * falloff * magneticResponse * polarityRef.current,
        )
        Body.applyForce(ball, ball.position, force)
        effects.get(ball.id)!.glow = Math.max(effects.get(ball.id)!.glow, falloff * strength)
      }

      if (polarityRef.current === 1) {
        const steelBalls = balls.filter((ball) => {
          const visual = visuals.get(ball.id)
          return visual?.material === 'steel' && Vector.magnitude(Vector.sub(magnet.position, ball.position)) < range
        })
        const linked = new Set<number>()
        for (const steel of steelBalls) {
          if (linked.has(steel.id)) continue
          let nearest: Body | null = null
          let nearestDistance = Number.POSITIVE_INFINITY
          for (const candidate of steelBalls) {
            if (candidate === steel || linked.has(candidate.id)) continue
            const distance = Vector.magnitude(Vector.sub(candidate.position, steel.position))
            if (distance < 108 && distance < nearestDistance) {
              nearest = candidate
              nearestDistance = distance
            }
          }
          if (!nearest) continue
          linked.add(steel.id)
          linked.add(nearest.id)
          steelLinks.push([steel, nearest])
          const delta = Vector.sub(nearest.position, steel.position)
          const desiredDistance = visuals.get(steel.id)!.radius + visuals.get(nearest.id)!.radius + 5
          const pull = Math.max(0, Math.min(1, (nearestDistance - desiredDistance) / 70))
          if (pull > 0) {
            const force = Vector.mult(Vector.normalise(delta), steel.mass * 0.00032 * pull * strength)
            Body.applyForce(steel, steel.position, force)
            Body.applyForce(nearest, nearest.position, Vector.neg(force))
          }
        }
      }
    }

    function burstSparks(position: Point, material: MaterialId, amount: number) {
      const color = materials[material].highlight
      for (let index = 0; index < amount; index += 1) {
        const angle = (Math.PI * 2 * index) / amount + Math.random() * 0.4
        const speed = 1.5 + Math.random() * 4.5
        sparks.push({
          x: position.x,
          y: position.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 2 + Math.random() * 4,
          color,
        })
      }
    }

    function handleMaterialImpact(body: Body, impact: number) {
      const visual = visuals.get(body.id)
      const effect = effects.get(body.id)
      if (!visual || !effect) return
      effect.glow = Math.max(effect.glow, Math.min(1, impact / 12))

      if (visual.material === 'rubber') {
        effect.squash = Math.max(effect.squash, Math.min(0.9, impact / 12))
      }

      if (visual.material === 'glass' && impact > 4.8) {
        effect.crack = Math.min(1, effect.crack + impact / 26)
        burstSparks(body.position, 'glass', Math.min(10, Math.ceil(impact)))
        shockwaves.push({
          x: body.position.x,
          y: body.position.y,
          radius: visual.radius,
          life: Math.min(1, impact / 10),
          color: '#7de0ec',
        })
      }

      if (visual.material === 'gravity' && impact > 3.8) {
        const forceScale = Math.min(1, impact / 12)
        shockwaves.push({ x: body.position.x, y: body.position.y, radius: visual.radius, life: 1, color: '#9d72ff' })
        for (const other of balls) {
          if (other === body) continue
          const delta = Vector.sub(other.position, body.position)
          const distance = Vector.magnitude(delta)
          if (distance < 16 || distance > 190) continue
          const impulse = (1 - distance / 190) * forceScale
          Body.applyForce(other, other.position, Vector.mult(Vector.normalise(delta), other.mass * 0.008 * impulse))
        }
      }
    }

    function handleCollision(event: IEventCollision<Engine>) {
      for (const pair of event.pairs) {
        const relativeVelocity = Vector.sub(pair.bodyA.velocity, pair.bodyB.velocity)
        const impact = Vector.magnitude(relativeVelocity)
        const visualA = visuals.get(pair.bodyA.id)
        const visualB = visuals.get(pair.bodyB.id)
        const gravityHitsMagnet =
          (visualA?.material === 'gravity' && pair.bodyB === magnet) ||
          (visualB?.material === 'gravity' && pair.bodyA === magnet)
        const now = performance.now()

        if (gravityHitsMagnet && impact > 2.4 && now - lastGravityFlipAt > 700) {
          lastGravityFlipAt = now
          const nextPolarity = polarityRef.current === 1 ? -1 : 1
          polarityRef.current = nextPolarity
          setPolarity(nextPolarity)
          shockwaves.push({
            x: magnet.position.x,
            y: magnet.position.y,
            radius: 50,
            life: 1,
            color: nextPolarity === 1 ? '#315efb' : '#ff5b57',
          })
          if (!mutedRef.current) soundEngine.magnet()
          if ('vibrate' in navigator) navigator.vibrate([14, 20, 18])
        }

        if (impact < 1.8) continue
        handleMaterialImpact(pair.bodyA, impact)
        handleMaterialImpact(pair.bodyB, impact)

        const ballBody = visuals.has(pair.bodyA.id) ? pair.bodyA : visuals.has(pair.bodyB.id) ? pair.bodyB : null
        const otherBody = ballBody === pair.bodyA ? pair.bodyB : pair.bodyA
        if (ballBody && otherBody.label.startsWith('bumper') && impact > 3) {
          Body.applyForce(ballBody, ballBody.position, {
            x: -ballBody.velocity.x * ballBody.mass * 0.0015,
            y: -ballBody.mass * 0.004,
          })
          burstSparks(ballBody.position, visuals.get(ballBody.id)!.material, 5)
        }

        if (!mutedRef.current && now - lastImpactAt > 62) {
          const ballVisual = ballBody ? visuals.get(ballBody.id)! : null
          if (ballVisual?.material === 'glass') {
            soundEngine.glassNote(ballVisual.radius, Math.min(1, impact / 13))
          } else {
            soundEngine.materialImpact(ballVisual?.material ?? 'steel', Math.min(1, impact / 13))
          }
          lastImpactAt = now
        }
      }
    }

    function drawBackground() {
      const gradient = context.createLinearGradient(0, 0, dimensions.width, dimensions.height)
      gradient.addColorStop(0, '#eef2ff')
      gradient.addColorStop(0.45, '#fbf7ef')
      gradient.addColorStop(1, '#eaf8f1')
      context.fillStyle = gradient
      context.fillRect(0, 0, dimensions.width, dimensions.height)
      context.save()
      context.globalAlpha = 0.25
      context.strokeStyle = '#afbbcd'
      context.lineWidth = 1
      const grid = 52
      for (let x = grid; x < dimensions.width; x += grid) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, dimensions.height); context.stroke()
      }
      for (let y = grid; y < dimensions.height; y += grid) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(dimensions.width, y); context.stroke()
      }
      context.restore()
    }

    function drawField() {
      const strength = fieldStrengthRef.current
      const range = 190 + strength * 310
      context.save()
      context.translate(magnet.position.x, magnet.position.y)
      context.strokeStyle = polarityRef.current === 1 ? 'rgba(49,94,251,0.16)' : 'rgba(255,91,87,0.16)'
      context.lineWidth = 1
      context.setLineDash([4, 9])
      for (let ring = 1; ring <= 3; ring += 1) {
        context.globalAlpha = 0.45 + strength * 0.3 - ring * 0.08
        context.beginPath()
        context.arc(0, 0, (range / 3) * ring, 0, Math.PI * 2)
        context.stroke()
      }
      context.restore()
    }

    function drawSteelLinks() {
      const time = performance.now() * 0.004
      context.save()
      context.lineCap = 'round'
      for (const [first, second] of steelLinks) {
        const delta = Vector.sub(second.position, first.position)
        const distance = Vector.magnitude(delta)
        if (distance < 1) continue
        const normal = { x: -delta.y / distance, y: delta.x / distance }
        const ripple = Math.sin(time + first.id * 0.7) * Math.min(7, distance * 0.08)
        const midpoint = {
          x: (first.position.x + second.position.x) / 2 + normal.x * ripple,
          y: (first.position.y + second.position.y) / 2 + normal.y * ripple,
        }
        context.strokeStyle = 'rgba(49,94,251,0.2)'
        context.lineWidth = 5
        context.beginPath()
        context.moveTo(first.position.x, first.position.y)
        context.quadraticCurveTo(midpoint.x, midpoint.y, second.position.x, second.position.y)
        context.stroke()
        context.strokeStyle = 'rgba(218,231,255,0.78)'
        context.lineWidth = 1.2
        context.beginPath()
        context.moveTo(first.position.x, first.position.y)
        context.quadraticCurveTo(midpoint.x, midpoint.y, second.position.x, second.position.y)
        context.stroke()
      }
      context.restore()
    }

    function drawRails() {
      for (const rail of rails) {
        context.save()
        context.translate(rail.body.position.x, rail.body.position.y)
        context.rotate(rail.body.angle)
        context.shadowColor = 'rgba(34,43,56,0.18)'
        context.shadowBlur = 18
        context.shadowOffsetY = 8
        const gradient = context.createLinearGradient(-rail.width / 2, 0, rail.width / 2, 0)
        gradient.addColorStop(0, '#18202a')
        gradient.addColorStop(0.07, rail.color)
        gradient.addColorStop(0.9, rail.color)
        gradient.addColorStop(1, '#18202a')
        context.fillStyle = gradient
        context.beginPath()
        context.roundRect(-rail.width / 2, -rail.height / 2, rail.width, rail.height, rail.height / 2)
        context.fill()
        context.shadowColor = 'transparent'
        context.fillStyle = 'rgba(255,255,255,0.86)'
        context.beginPath(); context.arc(-rail.width / 2 + 9, 0, 4, 0, Math.PI * 2); context.fill()
        context.beginPath(); context.arc(rail.width / 2 - 9, 0, 4, 0, Math.PI * 2); context.fill()
        context.restore()
      }
    }

    function drawGlassBall(body: Body, visual: BallVisual, effect: BallEffect) {
      const { x, y } = body.position
      const radius = visual.radius

      context.save()
      context.shadowColor = `rgba(47, 91, 132, ${0.16 + effect.glow * 0.12})`
      context.shadowBlur = 18 + effect.glow * 20
      context.shadowOffsetY = 9

      const glassBody = context.createRadialGradient(
        x - radius * 0.4,
        y - radius * 0.48,
        radius * 0.03,
        x + radius * 0.08,
        y + radius * 0.1,
        radius * 1.08,
      )
      glassBody.addColorStop(0, 'rgba(255,255,255,0.42)')
      glassBody.addColorStop(0.2, 'rgba(255,255,255,0.12)')
      glassBody.addColorStop(0.58, 'rgba(220,245,255,0.08)')
      glassBody.addColorStop(0.82, 'rgba(105,199,255,0.16)')
      glassBody.addColorStop(1, 'rgba(91,104,230,0.27)')
      context.fillStyle = glassBody
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill()
      context.shadowColor = 'transparent'

      context.save()
      context.beginPath(); context.arc(x, y, radius - 1, 0, Math.PI * 2); context.clip()

      const frost = context.createRadialGradient(
        x - radius * 0.18,
        y - radius * 0.22,
        0,
        x - radius * 0.05,
        y - radius * 0.08,
        radius * 0.82,
      )
      frost.addColorStop(0, 'rgba(255,255,255,0.12)')
      frost.addColorStop(0.62, 'rgba(255,255,255,0.025)')
      frost.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = frost
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill()

      context.strokeStyle = 'rgba(113, 220, 255, 0.42)'
      context.lineWidth = Math.max(2.2, radius * 0.12)
      context.beginPath(); context.arc(x + radius * 0.06, y + radius * 0.06, radius * 0.79, 0.14, 1.55); context.stroke()
      context.strokeStyle = 'rgba(137, 112, 255, 0.27)'
      context.lineWidth = Math.max(1.4, radius * 0.07)
      context.beginPath(); context.arc(x + radius * 0.04, y + radius * 0.04, radius * 0.87, 0.42, 1.38); context.stroke()
      context.restore()

      context.strokeStyle = 'rgba(255, 116, 157, 0.2)'
      context.lineWidth = 1.2
      context.beginPath(); context.arc(x - 0.8, y, radius - 1.1, 1.75, 3.82); context.stroke()
      context.strokeStyle = 'rgba(73, 190, 255, 0.38)'
      context.beginPath(); context.arc(x + 0.8, y, radius - 1.1, -1.32, 1.45); context.stroke()

      context.strokeStyle = 'rgba(255,255,255,0.72)'
      context.lineWidth = Math.max(1.15, radius * 0.055)
      context.beginPath(); context.arc(x, y, radius - 2.2, -2.78, -0.8); context.stroke()
      context.strokeStyle = 'rgba(255,255,255,0.28)'
      context.lineWidth = 1
      context.beginPath(); context.arc(x, y, radius - 4.8, -2.62, -1.12); context.stroke()

      const highlight = context.createRadialGradient(
        x - radius * 0.43,
        y - radius * 0.5,
        0,
        x - radius * 0.43,
        y - radius * 0.5,
        radius * 0.34,
      )
      highlight.addColorStop(0, 'rgba(255,255,255,0.96)')
      highlight.addColorStop(0.22, 'rgba(255,255,255,0.54)')
      highlight.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = highlight
      context.beginPath(); context.arc(x - radius * 0.43, y - radius * 0.5, radius * 0.34, 0, Math.PI * 2); context.fill()

      if (effect.crack > 0.08) {
        context.save()
        context.beginPath(); context.arc(x, y, radius - 2, 0, Math.PI * 2); context.clip()
        context.translate(x, y)
        context.rotate(body.angle)
        context.strokeStyle = `rgba(255,255,255,${0.48 + effect.crack * 0.44})`
        context.shadowColor = 'rgba(130,224,255,0.72)'
        context.shadowBlur = 3
        context.lineWidth = 0.55 + effect.crack * 0.45
        for (let ray = 0; ray < 7; ray += 1) {
          const angle = ray * 0.91 + body.id * 0.17
          const reach = radius * Math.min(0.9, effect.crack + 0.2)
          const bend = angle + (ray % 2 === 0 ? 0.14 : -0.12)
          context.beginPath()
          context.moveTo(0, 0)
          context.lineTo(Math.cos(angle) * reach * 0.46, Math.sin(angle) * reach * 0.46)
          context.lineTo(Math.cos(bend) * reach, Math.sin(bend) * reach)
          context.stroke()
          if (effect.crack > 0.42) {
            context.beginPath()
            context.moveTo(Math.cos(angle) * reach * 0.46, Math.sin(angle) * reach * 0.46)
            context.lineTo(Math.cos(angle + 0.48) * reach * 0.68, Math.sin(angle + 0.48) * reach * 0.68)
            context.stroke()
          }
        }
        context.restore()
      }
      context.restore()
    }

    function drawBall(body: Body, visual: BallVisual) {
      const effect = effects.get(body.id)!
      effect.squash *= 0.9
      effect.glow *= 0.94

      if (visual.material === 'glass') {
        drawGlassBall(body, visual, effect)
        return
      }

      const speed = Vector.magnitude(body.velocity)
      const motionSquash = visual.material === 'rubber' ? Math.min(0.16, speed / 85) : 0
      const squash = Math.max(effect.squash * 0.22, motionSquash)
      const rotation = visual.material === 'rubber' && speed > 0.35
        ? Math.atan2(body.velocity.y, body.velocity.x)
        : 0

      // The gradient is created before the body transform so every material
      // shares one world-space light source in the upper-left of the scene.
      const gradient = context.createRadialGradient(
        body.position.x - visual.radius * 0.38,
        body.position.y - visual.radius * 0.46,
        visual.radius * 0.06,
        body.position.x,
        body.position.y,
        visual.radius,
      )
      if (visual.material === 'gravity') {
        gradient.addColorStop(0, visual.highlight)
        gradient.addColorStop(0.22, '#3b4554')
        gradient.addColorStop(1, '#0d1118')
      } else {
        gradient.addColorStop(0, visual.highlight)
        gradient.addColorStop(0.34, visual.color)
        gradient.addColorStop(1, visual.material === 'steel' ? '#17233a' : '#7c2029')
      }

      const { x, y } = body.position
      const radiusX = visual.radius * (1 + squash)
      const radiusY = visual.radius * (1 - squash)
      context.save()
      context.shadowColor = visual.material === 'gravity'
        ? 'rgba(35,24,68,0.36)'
        : `rgba(32,42,58,${0.2 + effect.glow * 0.18})`
      context.shadowBlur = 15 + effect.glow * 24
      context.shadowOffsetY = 8

      context.fillStyle = gradient
      context.beginPath(); context.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2); context.fill()
      context.shadowColor = 'transparent'

      if (visual.material === 'steel') {
        context.strokeStyle = `rgba(218,231,255,${0.18 + effect.glow * 0.48})`
        context.lineWidth = 1.5
        context.beginPath(); context.arc(x, y, visual.radius - 5, -2.5, -0.5); context.stroke()
      }

      if (visual.material === 'gravity') {
        context.strokeStyle = 'rgba(182,239,74,0.5)'
        context.lineWidth = 2
        context.beginPath(); context.arc(x, y, visual.radius * 0.48, 0, Math.PI * 2); context.stroke()
        context.fillStyle = '#b6ef4a'
        context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill()
      }
      context.restore()
    }

    function drawMagnet() {
      const strength = fieldStrengthRef.current
      context.save()
      context.translate(magnet.position.x, magnet.position.y)
      context.shadowColor = polarityRef.current === 1 ? 'rgba(49,94,251,0.38)' : 'rgba(255,91,87,0.38)'
      context.shadowBlur = 34 + strength * 16
      context.shadowOffsetY = 12
      context.fillStyle = '#151a22'
      context.beginPath(); context.arc(0, 0, 50, 0, Math.PI * 2); context.fill()
      context.shadowColor = 'transparent'
      context.strokeStyle = polarityRef.current === 1 ? '#315efb' : '#ff5b57'
      context.lineWidth = 7
      context.beginPath(); context.arc(0, 0, 39, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * strength); context.stroke()
      context.fillStyle = polarityRef.current === 1 ? '#315efb' : '#ff5b57'
      context.beginPath(); context.arc(0, 0, 32, 0, Math.PI * 2); context.fill()
      context.fillStyle = '#fff'
      context.font = '700 10px Inter, system-ui, sans-serif'
      context.textAlign = 'center'; context.textBaseline = 'middle'
      context.fillText(polarityRef.current === 1 ? 'PULL' : 'PUSH', 0, 0)
      context.restore()
    }

    function drawEffects() {
      for (let index = shockwaves.length - 1; index >= 0; index -= 1) {
        const wave = shockwaves[index]
        wave.radius += 5.2
        wave.life -= 0.025
        if (wave.life <= 0) { shockwaves.splice(index, 1); continue }
        context.save()
        context.globalAlpha = wave.life * 0.5
        context.strokeStyle = wave.color
        context.lineWidth = 2 + wave.life * 3
        context.beginPath(); context.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2); context.stroke()
        context.restore()
      }

      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index]
        spark.x += spark.vx; spark.y += spark.vy; spark.vy += 0.06; spark.life -= 0.025
        if (spark.life <= 0) { sparks.splice(index, 1); continue }
        context.save()
        context.globalAlpha = spark.life
        context.fillStyle = spark.color
        context.beginPath(); context.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2); context.fill()
        context.restore()
      }
    }

    function render() {
      if (destroyed) return
      context.setTransform(dimensions.dpr, 0, 0, dimensions.dpr, 0, 0)
      context.clearRect(0, 0, dimensions.width, dimensions.height)
      drawBackground()
      drawField()
      drawRails()
      drawSteelLinks()
      for (const ball of balls) drawBall(ball, visuals.get(ball.id)!)
      drawMagnet()
      drawEffects()
      animationFrame = window.requestAnimationFrame(render)
    }

    let pressStart: Point | null = null
    let activeRail: RailDrag | null = null

    function canvasPoint(event: globalThis.PointerEvent): Point {
      const bounds = canvas.getBoundingClientRect()
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    }

    function hitRail(point: Point) {
      for (let index = rails.length - 1; index >= 0; index -= 1) {
        const rail = rails[index]
        const dx = point.x - rail.body.position.x
        const dy = point.y - rail.body.position.y
        const cosine = Math.cos(-rail.body.angle)
        const sine = Math.sin(-rail.body.angle)
        const localX = dx * cosine - dy * sine
        const localY = dx * sine + dy * cosine
        if (Math.abs(localX) <= rail.width / 2 + 12 && Math.abs(localY) <= 25) {
          return {
            rail,
            mode: Math.abs(localX) > rail.width / 2 - 34 ? 'rotate' as const : 'move' as const,
          }
        }
      }
      return null
    }

    function handlePointerDown(event: globalThis.PointerEvent) {
      const point = canvasPoint(event)
      const hit = hitRail(point)
      if (hit) {
        activeRail = {
          rail: hit.rail,
          mode: hit.mode,
          offset: {
            x: point.x - hit.rail.body.position.x,
            y: point.y - hit.rail.body.position.y,
          },
        }
        pressStart = null
        canvas.setPointerCapture(event.pointerId)
        canvas.style.cursor = hit.mode === 'rotate' ? 'crosshair' : 'grabbing'
        if (!mutedRef.current) soundEngine.pickUp()
        return
      }
      pressStart = { x: event.clientX, y: event.clientY }
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      const point = canvasPoint(event)
      if (activeRail) {
        if (activeRail.mode === 'move') {
          Body.setPosition(activeRail.rail.body, {
            x: point.x - activeRail.offset.x,
            y: point.y - activeRail.offset.y,
          })
        } else {
          Body.setAngle(
            activeRail.rail.body,
            Math.atan2(point.y - activeRail.rail.body.position.y, point.x - activeRail.rail.body.position.x),
          )
        }
        return
      }
      const hit = hitRail(point)
      canvas.style.cursor = hit ? (hit.mode === 'rotate' ? 'crosshair' : 'move') : 'grab'
    }

    function handlePointerUp(event: globalThis.PointerEvent) {
      if (activeRail) {
        activeRail = null
        canvas.style.cursor = 'grab'
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        return
      }
      if (!pressStart) return
      const moved = Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y)
      pressStart = null
      if (moved > 7) return
      const point = canvasPoint(event)
      if (Vector.magnitude(Vector.sub(point, magnet.position)) <= 56) {
        const nextPolarity = polarityRef.current === 1 ? -1 : 1
        polarityRef.current = nextPolarity
        setPolarity(nextPolarity)
        shockwaves.push({ x: magnet.position.x, y: magnet.position.y, radius: 50, life: 1, color: nextPolarity === 1 ? '#315efb' : '#ff5b57' })
        if (!mutedRef.current) soundEngine.magnet()
        if ('vibrate' in navigator) navigator.vibrate(10)
      }
    }

    function handlePointerCancel() {
      activeRail = null
      pressStart = null
      canvas.style.cursor = 'grab'
    }

    Events.on(engine, 'beforeUpdate', applyMagnetism)
    Events.on(engine, 'collisionStart', handleCollision)
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('resize', resize)
    Runner.run(runner, engine)
    render()

    return () => {
      destroyed = true
      spawnBallRef.current = () => undefined
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      Events.off(engine, 'beforeUpdate', applyMagnetism)
      Events.off(engine, 'collisionStart', handleCollision)
      Runner.stop(runner)
      Composite.clear(engine.world, false)
      Engine.clear(engine)
      Mouse.clearSourceEvents(mouse)
    }
  }, [worldKey])

  function togglePolarity() {
    const nextPolarity = polarityRef.current === 1 ? -1 : 1
    polarityRef.current = nextPolarity
    setPolarity(nextPolarity)
    if (!muted) soundEngine.magnet()
  }

  function resetWorld() {
    polarityRef.current = 1
    fieldStrengthRef.current = 0.68
    setPolarity(1)
    setFieldStrength(0.68)
    setCounts({ ...initialCounts })
    setWorldKey((key) => key + 1)
  }

  return (
    <main className="material-lab" ref={stageRef}>
      <canvas ref={canvasRef} className="physics-canvas" aria-label="多材质球物理解压实验桌" />

      <header className="lab-header">
        <div className="lab-brand">
          <span className="lab-symbol" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>Tinker</strong><small>MATERIAL LAB</small></div>
        </div>
        <p className="lab-title">多材质实验桌</p>
        <div className="lab-actions">
          <button type="button" onClick={() => setMuted(!muted)} title={muted ? '打开声音' : '静音'} aria-label={muted ? '打开声音' : '静音'}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button type="button" onClick={resetWorld} title="重置实验桌" aria-label="重置实验桌">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <aside
        className={`control-drawer ${drawerOpen ? 'is-open' : 'is-closed'}`}
        aria-label="实验桌控制器"
        onPointerEnter={cancelDrawerClose}
        onPointerLeave={() => scheduleDrawerClose()}
        onFocusCapture={() => {
          cancelDrawerClose()
          setDrawerOpen(true)
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) scheduleDrawerClose()
        }}
      >
        <div className="drawer-panel">
          <section className="material-rack" aria-label="材质发球器">
            <p>MATERIALS</p>
            {materialOrder.map((material) => {
              const config = materials[material]
              return (
                <button
                  className={`material-launcher launcher-${material}`}
                  type="button"
                  key={material}
                  onClick={() => spawnBallRef.current(material)}
                  aria-label={`发射一颗${config.name}球`}
                >
                  <span className="launcher-orb" aria-hidden="true" />
                  <span className="launcher-copy"><strong>{config.code}</strong><small>{config.name}</small></span>
                  <b>{counts[material]}</b>
                </button>
              )
            })}
          </section>

          <section className="magnet-console" aria-label="磁场控制">
            <button className={`polarity-switch polarity-${polarity === 1 ? 'pull' : 'push'}`} type="button" onClick={togglePolarity}>
              <span>MAGNET</span><strong>{polarity === 1 ? 'PULL' : 'PUSH'}</strong>
            </button>
            <label className="field-slider">
              <span>FIELD</span>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.01"
                value={fieldStrength}
                onChange={(event) => setFieldStrength(Number(event.target.value))}
                aria-label="磁场强度"
              />
            </label>
          </section>
        </div>

        <button
          className="drawer-handle"
          type="button"
          aria-expanded={drawerOpen}
          aria-label={drawerOpen ? '收起功能栏' : '展开功能栏'}
          title={drawerOpen ? '收起功能栏' : '展开功能栏'}
          onClick={() => {
            cancelDrawerClose()
            const nextOpen = !drawerOpen
            setDrawerOpen(nextOpen)
          }}
        >
          <span className="handle-colors" aria-hidden="true"><i /><i /><i /></span>
          {drawerOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
        </button>
      </aside>

      <div className="rail-label" aria-hidden="true"><span /> KINETIC RAIL</div>
    </main>
  )
}

export default App
