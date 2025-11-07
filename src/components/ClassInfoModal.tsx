import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';

interface ClassInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (classInfo: { class_: string; section: string; date: string }) => void;
}

const ClassInfoModal: React.FC<ClassInfoModalProps> = ({
  isOpen,
  onClose,
  onConfirm
}) => {
  const [class_, setClass] = useState('');
  const [section, setSection] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (class_ && section && date) {
      onConfirm({ class_, section, date });
      setClass('');
      setSection('');
      setDate('');
    }
  };

  if (!isOpen) return null;
  
  console.log("ClassInfoModal is rendering, isOpen:", isOpen);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-[400px] w-[90%] shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-gray-900 m-0 text-xl font-semibold">
            Class Information
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer p-2 rounded-md flex items-center justify-center transition-colors"
          >
            <FiX size={20} />
          </button>
        </div>

        <p className="text-gray-500 m-0 mb-6 text-sm leading-relaxed">
          Please provide class information to process the attendance image:
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="text-gray-900 block text-sm font-medium mb-2">
              Class *
            </label>
            <input
              type="text"
              value={class_}
              onChange={(e) => setClass(e.target.value)}
              placeholder="e.g., 10, 12, NURSERY"
              required
              className="w-full px-3 py-3 rounded-lg text-sm outline-none transition-all bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="mb-4">
            <label className="text-gray-900 block text-sm font-medium mb-2">
              Section *
            </label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g., A, B, C"
              required
              className="w-full px-3 py-3 rounded-lg text-sm outline-none transition-all bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="mb-6">
            <label className="text-gray-900 block text-sm font-medium mb-2">
              Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-3 rounded-lg text-sm outline-none transition-all bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-lg text-sm font-medium transition-all border border-gray-300 bg-transparent text-gray-900 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!class_ || !section || !date}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                class_ && section && date
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-blue-400 text-white cursor-not-allowed opacity-50'
              }`}
            >
              Process Image
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClassInfoModal;
