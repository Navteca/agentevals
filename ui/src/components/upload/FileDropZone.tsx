import React from 'react';
import { Upload } from 'antd';
import type { UploadProps } from 'antd';
import { FileJson } from 'lucide-react';
import { css } from '@emotion/react';

const { Dragger } = Upload;

interface FileDropZoneProps {
  title: string;
  description: string;
  multiple?: boolean;
  onChange: (files: File[]) => void;
  accept?: string;
}

const dropZoneStyle = css`
  .ant-upload.ant-upload-drag {
    background-color: var(--bg-surface);
    border: 2px dashed var(--border-default);
    border-radius: 8px;
    transition: all 0.3s ease;

    &:hover {
      border-color: var(--accent-cyan);
      background-color: var(--bg-elevated);
    }
  }

  .ant-upload-drag-icon {
    color: var(--accent-cyan);
  }

  .ant-upload-text {
    color: var(--text-primary) !important;
    font-size: 16px;
    font-weight: 500;
  }

  .ant-upload-hint {
    color: var(--text-secondary) !important;
    font-size: 14px;
  }
`;

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  title,
  description,
  multiple = false,
  onChange,
  accept = '.json',
}) => {
  const uploadProps: UploadProps = {
    name: 'file',
    multiple,
    accept,
    beforeUpload: (file, fileList) => {
      // Handle file selection
      if (multiple) {
        onChange(fileList);
      } else {
        onChange([file]);
      }
      // Prevent auto upload
      return false;
    },
    onRemove: () => {
      onChange([]);
    },
    showUploadList: true,
  };

  return (
    <div css={dropZoneStyle}>
      <Dragger {...uploadProps}>
        <p className="ant-upload-drag-icon">
          <FileJson size={48} />
        </p>
        <p className="ant-upload-text">{title}</p>
        <p className="ant-upload-hint">{description}</p>
      </Dragger>
    </div>
  );
};
