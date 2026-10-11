import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import ReaderExcerptSheet from '../src/screens/reader/ReaderExcerptSheet';

jest.mock('../src/components', () => ({ Icon: () => null }));

describe('ReaderExcerptSheet', () => {
  const props = {
    draft: {
      chapterId: 'chapter-1',
      position: 20,
      excerpt: '完整摘抄'.repeat(100),
      note: '完整笔记'.repeat(100),
      originalNote: '完整笔记'.repeat(100),
      saved: true,
    },
    chapterTitle: '第1章：很长的章节标题'.repeat(5),
    bottomInset: 34,
    colors: {
      background: '#fff',
      field: '#eee',
      ink: '#222',
      sub: '#666',
      border: '#ddd',
    },
    onChangeNote: jest.fn(),
    onClose: jest.fn(),
    onSave: jest.fn(),
    onReturnToText: jest.fn(),
  };
  let tree: Renderer.ReactTestRenderer;
  afterEach(() => {
    act(() => tree.unmount());
    jest.clearAllMocks();
  });

  it('renders the full quote and note without a reading jump; actions stay explicit', () => {
    act(() => {
      tree = Renderer.create(<ReaderExcerptSheet {...props} />);
    });
    const quote = tree.root
      .findByProps({ testID: 'excerpt-full-text' })
      .findAllByType(Text)
      .find(node => node.props.children === props.draft.excerpt)!;
    expect(quote.props.numberOfLines).toBeUndefined();
    expect(tree.root.findByType(TextInput).props.value).toBe(props.draft.note);
    expect(props.onReturnToText).not.toHaveBeenCalled();
    act(() => tree.root.findByType(TextInput).props.onChangeText('补充想法'));
    expect(props.onChangeNote).toHaveBeenCalledWith('补充想法');
    act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '保存摘抄笔记' })[0]
        .props.onPress(),
    );
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onReturnToText).not.toHaveBeenCalled();
    act(() =>
      tree.root
        .findAllByProps({ accessibilityLabel: '返回摘抄原文' })[0]
        .props.onPress(),
    );
    expect(props.onReturnToText).toHaveBeenCalledTimes(1);
  });

  it('keeps unavailable-chapter notes editable, but disables jumping to missing text', () => {
    act(() => {
      tree = Renderer.create(
        <ReaderExcerptSheet {...props} onReturnToText={undefined} />,
      );
    });
    expect(
      tree.root.findAllByProps({ accessibilityLabel: '返回摘抄原文' })[0].props
        .disabled,
    ).toBe(true);
    expect(tree.root.findByType(TextInput).props.editable).not.toBe(false);
  });

  it('does not truncate imported notes longer than the normal input limit', () => {
    const longNote = '旧笔记'.repeat(300);
    act(() => {
      tree = Renderer.create(
        <ReaderExcerptSheet
          {...props}
          draft={{ ...props.draft, note: longNote, originalNote: longNote }}
        />,
      );
    });
    expect(tree.root.findByType(TextInput).props.maxLength).toBe(
      longNote.length,
    );
    expect(tree.root.findByType(TextInput).props.value).toBe(longNote);
  });
});
