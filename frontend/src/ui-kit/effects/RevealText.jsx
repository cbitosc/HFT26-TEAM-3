import { motion } from 'framer-motion';

/** Word-by-word blur-in reveal for headlines. `highlight` lists words to color with the accent. */
export default function RevealText({ text, className, delay = 0, highlight = [] }) {
  const marked = highlight.map((w) => w.toLowerCase());
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className={`inline-block whitespace-pre ${marked.includes(word.toLowerCase().replace(/[^a-z0-9]/g, '')) ? 'text-accent-text' : ''}`}
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.5, delay: delay + i * 0.06, ease: [0.2, 0, 0, 1] }}
        >
          {word + (i < words.length - 1 ? ' ' : '')}
        </motion.span>
      ))}
    </span>
  );
}
