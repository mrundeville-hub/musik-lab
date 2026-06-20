import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  ImageSegmenter,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'

const MODELS = {
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  selfie: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
}

let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null

async function getFileset() {
  fileset ??= await FilesetResolver.forVisionTasks(WASM_URL)
  return fileset
}

/** Loads a HandLandmarker in VIDEO mode. */
export async function createHandLandmarker(numHands = 2) {
  return HandLandmarker.createFromOptions(await getFileset(), {
    baseOptions: {
      modelAssetPath: MODELS.hand,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands,
    minHandDetectionConfidence: 0.55,
    minTrackingConfidence: 0.5,
  })
}

/** Loads a FaceLandmarker in VIDEO mode. */
export async function createFaceLandmarker() {
  return FaceLandmarker.createFromOptions(await getFileset(), {
    baseOptions: {
      modelAssetPath: MODELS.face,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  })
}

/** Loads a selfie ImageSegmenter in VIDEO mode (person silhouette confidence mask). */
export async function createImageSegmenter() {
  return ImageSegmenter.createFromOptions(await getFileset(), {
    baseOptions: {
      modelAssetPath: MODELS.selfie,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  })
}

/** Loads a lightweight PoseLandmarker in VIDEO mode. */
export async function createPoseLandmarker() {
  return PoseLandmarker.createFromOptions(await getFileset(), {
    baseOptions: {
      modelAssetPath: MODELS.pose,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}
