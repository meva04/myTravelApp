// 사진과 동영상. 둘 다 photo 표에 파일 이름으로 저장하고, 동영상인지는 확장자로 안다.
// 동영상은 가져올 때 첫 장면을 '<파일>.jpg' 로 만들어 두고 목록·썸네일에는 그 그림을 쓴다.

const VIDEO = /\.(mov|mp4|m4v|3gp|webm)$/i;

/** 동영상 파일인지 */
export const isVideo = (uri: string): boolean => VIDEO.test(uri.split('?')[0]);

/** 목록·썸네일에 보여 줄 그림 파일 (동영상이면 미리 만든 첫 장면) */
export const thumbOf = (uri: string): string => (isVideo(uri) ? `${uri}.jpg` : uri);
