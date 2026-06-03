import React from 'react';
import ImageViewerModal from './ImageViewerModal';

type SingleImageViewerProps = {
  open: boolean;
  src: string;
  alt: string;
  onClose: () => void;
};

const SingleImageViewer: React.FC<SingleImageViewerProps> = ({ open, src, alt, onClose }) => {
  if (!src) return null;
  return <ImageViewerModal open={open} src={src} alt={alt} onClose={onClose} />;
};

export default SingleImageViewer;
