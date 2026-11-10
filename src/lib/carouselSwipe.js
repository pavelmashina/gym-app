// Home advertising banner (#92): the slides change by swipe, there are no arrows.
// The rule is the one the exercise photo gallery uses: a finished touch changes the slide
// only when it is clearly horizontal, so a vertical scroll that starts on the banner
// stays a scroll.
export const CAROUSEL_SWIPE_MIN_PX = 45;
export const CAROUSEL_SWIPE_SLOPE = 1.3;

/** The slide a finished touch leads to. A swipe to the left opens the next slide; the ends wrap around. */
export function carouselSwipeIndex(current, count, deltaX, deltaY) {
  if (count < 2 || Math.abs(deltaX) < CAROUSEL_SWIPE_MIN_PX || Math.abs(deltaX) < Math.abs(deltaY) * CAROUSEL_SWIPE_SLOPE) return current;
  return (current + (deltaX < 0 ? 1 : -1) + count) % count;
}
