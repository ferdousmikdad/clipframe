// React wrapper around the framework-free player: <ClipframePlayer project={project} />.
import { createElement, useEffect, useImperativeHandle, useLayoutEffect, useRef, forwardRef, type CSSProperties } from "react";
import { createPlayer, type Player, type PlayerOptions } from "../player/index.js";

export type ClipframePlayerProps = PlayerOptions & {
  className?: string;
  style?: CSSProperties;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
};

export const ClipframePlayer = forwardRef<Player | null, ClipframePlayerProps>(function ClipframePlayer(props, ref) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const handlers = useRef(props);
  handlers.current = props;

  // Create once per registry / resolver / layout options; project changes are pushed in below.
  // (A layout effect, so the player exists before the ref handle below is set.)
  useLayoutEffect(() => {
    if (!box.current) return;
    const p = createPlayer(box.current, props);
    player.current = p;
    const offs = [p.on("timeupdate", (t) => handlers.current.onTimeUpdate?.(t)), p.on("ended", () => handlers.current.onEnded?.())];
    return () => {
      offs.forEach((off) => off());
      p.destroy();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.registry, props.resolveAsset, props.resolution, props.controls, props.loop, props.fontsUrl]);

  useEffect(() => {
    player.current?.setProject(props.project);
  }, [props.project]);

  useImperativeHandle(ref, () => player.current as Player, [props.registry, props.resolveAsset, props.resolution, props.controls, props.loop, props.fontsUrl]);

  return createElement("div", { ref: box, className: props.className, style: props.style });
});

export type { Player, PlayerOptions };
