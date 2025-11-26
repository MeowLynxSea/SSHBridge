// Type declarations for Next.js modules with resolution issues
declare module 'next/app' {
  export interface AppProps {
    Component: React.ComponentType<any>;
    pageProps: any;
  }
}

declare module 'next/head' {
  interface HeadProps {
    children?: React.ReactNode;
  }

  const Head: React.FC<HeadProps>;
  export default Head;
}

declare module 'next/router' {
  const useRouter: () => {
    push: (url: string) => Promise<boolean>;
    replace: (url: string) => Promise<boolean>;
    back: () => void;
    forward: () => void;
    reload: () => void;
    prefetch: (url: string) => Promise<void>;
    beforePopState: (cb: any) => void;
    events: {
      on: (event: string, handler: (...args: any[]) => void) => void;
      off: (event: string, handler: (...args: any[]) => void) => void;
      emit: (event: string, ...args: any[]) => void;
    };
  };
  export { useRouter };
}

declare module 'next/image' {
  interface ImageProps {
    src: string;
    alt: string;
    width: number | string;
    height: number | string;
    style?: React.CSSProperties;
    priority?: boolean;
    placeholder?: 'blur' | 'empty';
    blurDataURL?: string;
    unoptimized?: boolean;
    [key: string]: any;
  }

  const Image: React.FC<ImageProps>;
  export default Image;
}

declare module 'next/document' {
  export const Html: React.FC<React.HtmlHTMLAttributes<HTMLHtmlElement>>;
  export const Main: React.FC;
  export const NextScript: React.FC<{
    nonce?: string;
    crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined;
    children?: React.ReactNode;
  }>;

  export class Head extends React.Component<{
    nonce?: string;
    crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined;
    children?: React.ReactNode;
  }> {}

  export default class Document<P = {}> extends React.Component<any> {
    static getInitialProps: (ctx: any) => Promise<any>;
  }
}
