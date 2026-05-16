import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'

const FINGER_MAP: Record<string, string> = {
  ㅂ: 'pinky', ㅁ: 'pinky', ㅋ: 'pinky',
  ㅈ: 'ring', ㄴ: 'ring', ㅌ: 'ring',
  ㄷ: 'middle', ㅇ: 'middle', ㅊ: 'middle',
  ㄱ: 'index', ㅅ: 'index', ㄹ: 'index', ㅎ: 'index', ㅍ: 'index',
  ㅛ: 'index', ㅕ: 'index', ㅗ: 'index', ㅓ: 'index', ㅠ: 'index', ㅜ: 'index',
  ㅑ: 'middle', ㅏ: 'middle', ㅡ: 'middle',
  ㅐ: 'ring', ㅣ: 'ring',
  ㅔ: 'pinky',
  ' ': 'thumb',
}

function LeftHand({ pressedFinger }: { pressedFinger: string }) {
  const { scene } = useGLTF('/models/left_hand.glb')
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const bonesRef = useRef<Record<string, THREE.Bone[]> | null>(null)

  if (bonesRef.current == null) {
    const bones: Record<string, THREE.Bone[]> = { index: [], middle: [], ring: [], pinky: [], thumb: [] }
    clone.traverse((obj: THREE.Object3D) => {
      if (!(obj as THREE.Bone).isBone) return
      const name = (obj.name || '').toLowerCase()
      if (name.includes('drv') || name.includes('ik') || name.includes('master') || name.includes('parent')) return
      if (name.includes('index')) bones.index.push(obj as THREE.Bone)
      else if (name.includes('middle')) bones.middle.push(obj as THREE.Bone)
      else if (name.includes('ring')) bones.ring.push(obj as THREE.Bone)
      else if (name.includes('pinky')) bones.pinky.push(obj as THREE.Bone)
      else if (name.includes('thumb')) bones.thumb.push(obj as THREE.Bone)
    })
    bonesRef.current = bones
  }

  useFrame(() => {
    const bones = bonesRef.current
    if (!bones) return
    for (const finger of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
      const target = finger === pressedFinger ? 0.8 : 0
      for (const bone of bones[finger] || []) {
        bone.rotation.x += (target - bone.rotation.x) * 0.3
      }
    }
  })

  return <primitive object={clone} scale={7} rotation={[-0.7, Math.PI, 0]} position={[-2.5, -1, 0.5]} />
}

function RightHand({ pressedFinger }: { pressedFinger: string }) {
  const { scene } = useGLTF('/models/right_hand.glb')
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const bonesRef = useRef<Record<string, THREE.Bone[]> | null>(null)

  if (bonesRef.current == null) {
    const bones: Record<string, THREE.Bone[]> = { index: [], middle: [], ring: [], pinky: [], thumb: [] }
    clone.traverse((obj: THREE.Object3D) => {
      if (!(obj as THREE.Bone).isBone) return
      const name = (obj.name || '').toLowerCase()
      if (name.includes('drv') || name.includes('ik') || name.includes('master') || name.includes('parent')) return
      if (name.includes('index')) bones.index.push(obj as THREE.Bone)
      else if (name.includes('middle')) bones.middle.push(obj as THREE.Bone)
      else if (name.includes('ring')) bones.ring.push(obj as THREE.Bone)
      else if (name.includes('pinky')) bones.pinky.push(obj as THREE.Bone)
      else if (name.includes('thumb')) bones.thumb.push(obj as THREE.Bone)
    })
    bonesRef.current = bones
  }

  useFrame(() => {
    const bones = bonesRef.current
    if (!bones) return
    for (const finger of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
      const target = finger === pressedFinger ? 0.8 : 0
      for (const bone of bones[finger] || []) {
        bone.rotation.x += (target - bone.rotation.x) * 0.3
      }
    }
  })

  return <primitive object={clone} scale={7} rotation={[-0.7, Math.PI, 0]} position={[2.5, -1, 0.5]} />
}

interface Props {
  activeKey: string
  activeHand: 'left' | 'right' | ''
}

export default function Hand3D({ activeKey, activeHand }: Props) {
  const leftFinger = activeHand === 'left' ? FINGER_MAP[activeKey] || '' : ''
  const rightFinger = activeHand === 'right' ? FINGER_MAP[activeKey] || '' : ''

  return (
    <div className="hand3d-container">
      <Canvas camera={{ position: [0, 3, 3.5], fov: 50 }} style={{ pointerEvents: 'none' }}>
        <ambientLight intensity={1} />
        <directionalLight position={[0, 5, 3]} intensity={1} />
        <LeftHand pressedFinger={leftFinger} />
        <RightHand pressedFinger={rightFinger} />
      </Canvas>
    </div>
  )
}

useGLTF.preload('/models/left_hand.glb')
useGLTF.preload('/models/right_hand.glb')
