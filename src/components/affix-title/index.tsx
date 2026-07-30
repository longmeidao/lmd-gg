import { useEffect, useState } from 'react';
import classNames from 'classnames';

interface AffixTitleProps {
  /** 距离窗口顶部达到指定偏移量后触发, 默认 320 */
  offsetTop?: number;
  title: string;
}

const AffixTitle = (props: AffixTitleProps) => {
  const { title, offsetTop = 320 } = props;
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [backdropOpacity, setBackdropOpacity] = useState(0);

  const classes = classNames(
    'relative z-10 mx-auto flex h-16 max-w-[60rem] transform items-center justify-between px-6 transition-all duration-300 ease-in-out',
    isVisible
      ? ['pointer-events-auto', 'translate-y-0', 'opacity-100']
      : ['pointer-events-none', '-translate-y-full', 'opacity-0'],
  );

  const handleScroll = () => {
    const scrollTop = document.documentElement.scrollTop;
    const scrollableHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    setIsVisible(scrollTop >= offsetTop);
    setBackdropOpacity(
      offsetTop > 0 ? Math.min(1, Math.max(0, scrollTop / offsetTop)) : 1,
    );
    setScrollProgress(
      scrollableHeight > 0
        ? Math.min(100, Math.max(0, (scrollTop / scrollableHeight) * 100))
        : 100,
    );
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [offsetTop]);

  const size = 28;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset =
    circumference - (scrollProgress / 100) * circumference;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] w-full">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-32 overflow-hidden"
        style={{ opacity: backdropOpacity }}
        aria-hidden="true"
      >
        <div
          className="from-slate1/75 via-slate1/30 absolute inset-0 bg-gradient-to-b to-transparent"
          style={{
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            maskImage:
              'linear-gradient(to bottom, black 0%, black 42%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, black 42%, transparent 100%)',
          }}
        />
      </div>
      <div className={classes}>
        <button
          onClick={() => (window.location.href = '/')}
          className="text-slate11 hover:text-slate12 hover:bg-slate12/5 flex h-6 w-8 cursor-pointer items-center justify-center rounded-full transition-colors active:scale-95"
          aria-label="返回首页"
        >
          ←
        </button>
        <div className="min-w-0 truncate px-4 font-bold">{title}</div>
        <div
          className="relative h-7 w-7 shrink-0"
          role="progressbar"
          aria-label="阅读进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(scrollProgress)}
        >
          <svg
            width={size}
            height={size}
            className="-rotate-90 transform"
            aria-hidden="true"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="transparent"
              className="text-slate12/10"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-indigo9 transition-all duration-200"
            />
          </svg>
          <span className="text-slate11 absolute inset-0 flex items-center justify-center font-mono text-[8px] font-medium">
            {Math.round(scrollProgress)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AffixTitle;
