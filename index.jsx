import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Send, Image as ImageIcon, Download, LogOut, Lock, Pencil, Trash2, X } from 'lucide-react';

// 1. Inisialisasi Firebase (Di luar komponen)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [profile, setProfile] = useState(null); // { name, roomId }

  // 2. Autentikasi Firebase
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  if (!authLoaded) {
    return <div className="flex h-screen items-center justify-center bg-gray-100">Memuat sistem...</div>;
  }

  // Routing Sederhana
  if (!profile) {
    return <JoinScreen onJoin={setProfile} />;
  }

  return <ChatScreen user={user} profile={profile} onLeave={() => setProfile(null)} />;
}

// --- KOMPONEN: LAYAR BERGABUNG (LOGIN) ---
function JoinScreen({ onJoin }) {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && roomId.trim()) {
      // Standarisasi Room ID agar tidak ada spasi atau karakter aneh
      const cleanRoomId = roomId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      onJoin({ name: name.trim(), roomId: cleanRoomId });
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-200 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-[#075E54] p-6 text-center text-white">
          <div className="flex justify-center mb-3">
            <Lock size={40} />
          </div>
          <h1 className="text-2xl font-bold">Obrolan Privat</h1>
          <p className="text-sm opacity-80 mt-1">Hanya bisa diakses dengan kunci rahasia</p>
        </div>
        <form onSubmit={handleJoin} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Anda</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#128C7E] focus:outline-none"
              placeholder="Misal: Budi"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kunci Ruangan Rahasia</label>
            <input
              type="text"
              required
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#128C7E] focus:outline-none"
              placeholder="Misal: rahasia123"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#128C7E] text-white py-3 rounded-lg font-semibold hover:bg-[#075E54] transition-colors"
          >
            Masuk ke Percakapan
          </button>
        </form>
      </div>
    </div>
  );
}

// --- KOMPONEN: LAYAR OBROLAN (CHAT) ---
function ChatScreen({ user, profile, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [editingMsg, setEditingMsg] = useState(null); // State untuk edit pesan
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 3. Mengambil Data dari Firestore
  useEffect(() => {
    if (!user) return;

    // Menggunakan path spesifik untuk roomId ini agar terisolasi
    const roomCollection = collection(db, 'artifacts', appId, 'public', 'data', `chat_${profile.roomId}`);
    
    const unsubscribe = onSnapshot(roomCollection, 
      (snapshot) => {
        const msgs = [];
        snapshot.forEach((doc) => {
          msgs.push({ id: doc.id, ...doc.data() });
        });
        
        // Aturan: Jangan gunakan orderBy() di query, urutkan di memori (JavaScript)
        msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setMessages(msgs);
        scrollToBottom();
      },
      (error) => {
        console.error("Gagal memuat pesan:", error);
      }
    );

    return () => unsubscribe();
  }, [user, profile.roomId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 4. Mengirim / Mengedit Pesan Teks
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      if (editingMsg) {
        // Logika Update Pesan (Edit)
        const msgRef = doc(db, 'artifacts', appId, 'public', 'data', `chat_${profile.roomId}`, editingMsg.id);
        await updateDoc(msgRef, {
          text: textToSend,
          isEdited: true
        });
        setEditingMsg(null);
      } else {
        // Logika Kirim Pesan Baru
        const roomCollection = collection(db, 'artifacts', appId, 'public', 'data', `chat_${profile.roomId}`);
        await addDoc(roomCollection, {
          text: textToSend,
          senderId: user.uid,
          senderName: profile.name,
          timestamp: Date.now(),
          type: 'text'
        });
        scrollToBottom();
      }
    } catch (error) {
      console.error("Gagal mengirim/mengedit pesan:", error);
    }
  };

  // Fungsi untuk Menghapus Pesan (Soft Delete)
  const deleteMessage = async (msgId) => {
    try {
      const msgRef = doc(db, 'artifacts', appId, 'public', 'data', `chat_${profile.roomId}`, msgId);
      await updateDoc(msgRef, {
        isDeleted: true,
        text: 'Pesan ini telah dihapus',
        imageUrl: null
      });
    } catch (error) {
      console.error("Gagal menghapus pesan:", error);
    }
  };

  // 5. Kompresi & Kirim Gambar (Agar tidak melebihi batas database)
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = async () => {
        // Kompresi ukuran gambar
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Ubah ke base64 (JPEG, kualitas 60%)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);

        try {
          const roomCollection = collection(db, 'artifacts', appId, 'public', 'data', `chat_${profile.roomId}`);
          await addDoc(roomCollection, {
            imageUrl: compressedBase64,
            senderId: user.uid,
            senderName: profile.name,
            timestamp: Date.now(),
            type: 'image'
          });
          setIsUploading(false);
          scrollToBottom();
        } catch (error) {
          console.error("Gagal mengirim gambar:", error);
          setIsUploading(false);
        }
      };
    };
  };

  // 6. Ekspor ke Spreadsheet (CSV)
  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Waktu,Pengirim,Pesan,Tipe\n";

    messages.forEach(m => {
       const date = m.timestamp ? new Date(m.timestamp).toLocaleString('id-ID') : '';
       // Hindari koma pada teks yang bisa merusak format CSV
       const text = m.text ? `"${m.text.replace(/"/g, '""')}"` : '[Gambar]';
       const type = m.type || 'text';
       csvContent += `"${date}","${m.senderName}",${text},"${type}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Obrolan_${profile.roomId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-screen bg-[#efeae2]">
      {/* HEADER */}
      <header className="bg-[#075E54] text-white p-3 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-[#075E54] font-bold text-lg">
            {profile.roomId.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-semibold text-lg leading-tight">Ruang: {profile.roomId}</h2>
            <p className="text-xs text-[#d9fdd3]">Login sebagai: {profile.name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button onClick={exportToCSV} title="Ekspor ke Spreadsheet (CSV)" className="p-2 hover:bg-[#128C7E] rounded-full transition">
            <Download size={20} />
          </button>
          <button onClick={onLeave} title="Keluar" className="p-2 hover:bg-[#128C7E] rounded-full transition">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* CHAT AREA */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://i.pinimg.com/originals/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-fixed">
        {messages.length === 0 ? (
          <div className="flex justify-center mt-10">
            <div className="bg-[#FFF3C7] text-gray-700 px-4 py-2 rounded-lg text-sm shadow-sm text-center max-w-sm">
              Kirim pesan pertama Anda. Pesan ini dienkripsi secara E2E di dalam ruang "{profile.roomId}".
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user.uid;
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
            
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-lg p-2 shadow-sm relative ${isMe ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                  
                  {/* Tampilkan Nama Pengirim jika bukan saya */}
                  {!isMe && (
                    <div className="text-xs font-bold text-[#128C7E] mb-1">{msg.senderName}</div>
                  )}

                  {/* Isi Pesan (Teks, Gambar, atau Dihapus) */}
                  {msg.isDeleted ? (
                    <p className="text-gray-500 italic text-[14px] flex items-center pr-10">
                       🚫 Pesan ini telah dihapus
                    </p>
                  ) : (
                    <>
                      {msg.type === 'image' && msg.imageUrl ? (
                        <img src={msg.imageUrl} alt="Terkirim" className="rounded-md max-w-full h-auto mb-1" />
                      ) : (
                        <p className="text-gray-800 text-[15px] pr-6 whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </>
                  )}

                  {/* Bagian Bawah: Aksi (Edit/Hapus) & Waktu */}
                  <div className="flex justify-end items-center space-x-2 mt-1">
                    {isMe && !msg.isDeleted && (
                      <div className="flex space-x-2 text-gray-400">
                        {msg.type === 'text' && (
                          <button onClick={() => { setEditingMsg(msg); setInputText(msg.text); }} className="hover:text-blue-500 transition" title="Edit Pesan">
                            <Pencil size={13} />
                          </button>
                        )}
                        <button onClick={() => deleteMessage(msg.id)} className="hover:text-red-500 transition" title="Hapus Pesan">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] text-gray-500">
                      {msg.isEdited && <span className="mr-1 italic">(diedit)</span>}
                      {time}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* INPUT AREA */}
      <footer className="bg-[#f0f2f5] p-3 flex flex-col relative">
        {editingMsg && (
          <div className="flex items-center justify-between bg-blue-50 p-2 rounded-lg border-l-4 border-blue-500 mb-2 w-full shadow-sm">
            <div className="flex flex-col overflow-hidden mr-2">
              <span className="text-xs font-bold text-blue-600">Edit Pesan</span>
              <span className="text-sm text-gray-600 truncate">{editingMsg.text}</span>
            </div>
            <button onClick={() => { setEditingMsg(null); setInputText(''); }} className="text-gray-500 hover:text-gray-800 p-1">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex items-center space-x-2 w-full">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isUploading || editingMsg !== null}
            className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition disabled:opacity-50"
            title="Kirim Foto"
          >
            <ImageIcon size={24} />
          </button>
          
          <form onSubmit={sendMessage} className="flex-1 flex items-center bg-white rounded-full px-4 py-2 shadow-sm">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isUploading ? "Mengunggah gambar..." : editingMsg ? "Edit pesan Anda..." : "Ketik pesan..."}
              disabled={isUploading}
              className="flex-1 bg-transparent focus:outline-none text-gray-700"
            />
          </form>
          
          <button 
            onClick={sendMessage}
            disabled={!inputText.trim() || isUploading}
            className="p-3 bg-[#128C7E] text-white rounded-full hover:bg-[#075E54] transition shadow-sm disabled:opacity-50 disabled:bg-gray-400"
          >
            <Send size={20} className="ml-1" />
          </button>
        </div>
      </footer>
    </div>
  );
}
