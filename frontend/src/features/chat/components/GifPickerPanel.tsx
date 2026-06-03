import React, { useCallback, useEffect, useState } from 'react';
import styles from './GifPickerPanel.module.css';
import { Loader2, Search, X } from 'lucide-react';
import { debounce } from '../../../utils/debounce';
import { giphyMissingKeyMessage } from '../../../config/env';
import {
  fetchTrendingGifs,
  isGifPickerConfigured,
  searchGifs,
  type GifResult,
} from '../utils/gifPicker';

type GifPickerPanelProps = {
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
  disabled?: boolean;
};

const GifPickerPanel: React.FC<GifPickerPanelProps> = ({ onSelect, onClose, disabled }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    if (!isGifPickerConfigured()) {
      setError(giphyMissingKeyMessage);
      setGifs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = term.trim() ? await searchGifs(term) : await fetchTrendingGifs();
      setGifs(results);
    } catch (e) {
      setGifs([]);
      setError(e instanceof Error ? e.message : "GIFs couldn't be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const debouncedSearch = useCallback(
    debounce((term: string) => {
      void load(term);
    }, 350),
    [load],
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value);
  };

  return (
    <dialog className={styles.panel} open aria-label="Choose a GIF">
      <div className={styles.header}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search GIFs"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            disabled={disabled}
          />
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close GIF picker">
          <X size={18} />
        </button>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.centered}>
            <Loader2 size={22} className={styles.spinner} />
          </div>
        )}
        {!loading && error && <p className={styles.error}>{error}</p>}
        {!loading && !error && gifs.length === 0 && (
          <p className={styles.empty}>No GIFs found. Try another search.</p>
        )}
        {!loading && !error && gifs.length > 0 && (
          <div className={styles.grid}>
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className={styles.gifBtn}
                disabled={disabled}
                onClick={() => onSelect(gif)}
                title={gif.title}
              >
                <img src={gif.previewUrl} alt="" className={styles.gifImg} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <p className={styles.attribution}>
        Powered by{' '}
        <a href="https://giphy.com/" target="_blank" rel="noopener noreferrer">
          GIPHY
        </a>
      </p>
    </dialog>
  );
};

export default GifPickerPanel;
