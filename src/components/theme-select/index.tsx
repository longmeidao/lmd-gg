import { useMemo, useState, useEffect, type ReactNode } from 'react';
import DesktopOutlined from '@/assets/images/desktop-outlined.svg?react';
import SunOutlined from '@/assets/images/sun-outlined.svg?react';
import MoonOutlined from '@/assets/images/moon-outlined.svg?react';
import stateConfig from '~@/slate.config';
import { setThemeMode } from '@/helpers/utils';
import { ThemeValue } from '@/typings/global';

const THEME_LIST: Array<{ icon: ReactNode; value: ThemeValue; label: string }> =
  [
    {
      icon: <DesktopOutlined className="h-4 w-4" />,
      value: ThemeValue.Auto,
      label: '跟随系统',
    },
    {
      icon: <SunOutlined className="h-4 w-4" />,
      value: ThemeValue.Light,
      label: '浅色',
    },
    {
      icon: <MoonOutlined className="h-4 w-4" />,
      value: ThemeValue.Dark,
      label: '深色',
    },
  ];

const ThemeSelect = () => {
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>();

  useEffect(() => {
    const theme = localStorage.getItem('theme');
    if (
      theme === ThemeValue.Light ||
      theme === ThemeValue.Dark ||
      theme === ThemeValue.Auto
    ) {
      setCurrentTheme(theme);
      return;
    }
    const presetTheme = stateConfig.theme?.mode ?? ThemeValue.Auto;
    setCurrentTheme(presetTheme as ThemeValue);
  }, []);

  const themeSelectClasses = useMemo(() => {
    if (currentTheme === ThemeValue.Dark) {
      return 'left-[58px]';
    } else if (currentTheme === ThemeValue.Light) {
      return 'left-[30px]';
    } else {
      return 'left-0.5';
    }
  }, [currentTheme]);

  const handleThemeChange = (value: ThemeValue) => {
    setCurrentTheme(value);

    let mode = value;
    if (value === ThemeValue.Auto) {
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? ThemeValue.Dark
        : ThemeValue.Light;
    }
    localStorage.setItem('theme', value);
    setThemeMode(mode);
  };

  return (
    /*
     * 用原生 <button> 而不是 <div role="radio">：原生元素自带键盘激活、焦点环和
     * 正确的角色。之前那版还有两个问题——空格键没 preventDefault，按一下会连带
     * 把页面往下滚；aria-label 直接用了内部枚举值，读屏念的是 auto/light/dark。
     */
    <div
      className="bg-slate3 text-slate8 relative flex items-center rounded-full p-0.5"
      role="group"
      aria-label="主题"
    >
      <div
        aria-hidden="true"
        className={`bg-slate1 transition-left absolute top-0.5 h-7 w-7 rounded-full ${themeSelectClasses}`}
      ></div>
      {THEME_LIST.map((item) => (
        <button
          type="button"
          className={`relative inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors ${item.value === currentTheme ? 'text-slate12' : 'text-slate10 hover:text-slate11'}`}
          key={item.value}
          onClick={() => handleThemeChange(item.value)}
          aria-label={item.label}
          aria-pressed={item.value === currentTheme}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
};

export default ThemeSelect;
