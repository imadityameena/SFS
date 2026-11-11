import { APP_NAME, APP_FULL_NAME } from '../brand.js';
import { Logo } from './icons.jsx';

export default function Wordmark() {
  return (
    <span className="wordmark">
      <Logo />
      <span className="wordmark-name">{APP_NAME}</span>
      <span className="wordmark-sub">{APP_FULL_NAME}</span>
    </span>
  );
}
