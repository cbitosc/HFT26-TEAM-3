import Button from './Button';
import Modal from './Modal';

/** Destructive-action confirmation. Pass `danger` to color the confirm button red. */
export default function ConfirmationDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger, loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="t-small text-fg-2">{description}</div>
    </Modal>
  );
}
