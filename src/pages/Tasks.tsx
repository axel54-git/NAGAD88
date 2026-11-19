import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, CheckCircle2 } from 'lucide-react';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { getYouTubeThumbnail, sortVideosNewestFirst } from '../lib/youtube';
import { isVideoWatchedByUser } from '../lib/store';

export function Tasks() {
  const { user, config } = useAuth();
  const db = useAppStore();

  const liveUser = (user?.telegramId && db.users[user.telegramId]) ? db.users[user.telegramId] : user;

  if (!liveUser) return null;

  return (
    <main className="pb-8">
      <div className="px-3 pt-2.5">
      {/* YouTube Videos Section - Only shows unwatched videos */}
      {(() => {
        const allVideos = sortVideosNewestFirst(Array.isArray(config.videos) ? config.videos : []);

        const unwatchedVideos = liveUser
          ? allVideos.filter((v) => !isVideoWatchedByUser(liveUser.telegramId, v.id))
          : allVideos;

        return (
          <section className="mb-4">
            {/* Videos Header */}
            <div className="flex items-center justify-between px-0.5 mb-2.5">
              <h2 className="text-[15px] font-extrabold text-white tracking-tight drop-shadow-xs">
                Videos
              </h2>
              <span className="text-[11.5px] font-medium text-amber-200/85 drop-shadow-xs">
                Watch & earn rewards
              </span>
            </div>

            {unwatchedVideos.length > 0 ? (
              /* 2-Column Video Grid */
              <div className="grid grid-cols-2 gap-2.5">
                {unwatchedVideos.map((video) => {
                  const thumb = getYouTubeThumbnail(video.youtubeUrl);

                  return (
                    <motion.div
                      key={video.id}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Link
                        to={`/video/${video.id}`}
                        className="luxury-card group flex flex-col overflow-hidden rounded-2xl transition-all duration-200 hover:border-amber-300/45"
                      >
                        {/* Thumbnail Container - Native 16:9 without any black bars or duration badge */}
                        <div className="relative aspect-video w-full overflow-hidden bg-[#180d06]">
                          <img
                            src={thumb}
                            alt={video.title}
                            loading="eager"
                            decoding="sync"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
                            }}
                          />

                          {/* Gold Play Button Overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/15">
                            <div className="luxury-btn-gold flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-transform duration-200 group-hover:scale-110">
                              <Play className="h-4 w-4 fill-[#1c0e05] text-[#1c0e05] ml-0.5" />
                            </div>
                          </div>
                        </div>

                        {/* Card Content */}
                        <div className="flex flex-1 flex-col justify-between p-2.5">
                          <p className="line-clamp-2 text-[12px] font-bold leading-snug text-[#fff7eb] group-hover:text-amber-300 transition-colors">
                            {video.title}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[12px] font-extrabold text-emerald-400 tabular-nums">
                              +${Number(video.reward || 0.05).toFixed(2)}
                            </span>
                            {video.minWatchSeconds && (
                              <span className="text-[9.5px] font-semibold text-amber-100/60">
                                {Math.floor(video.minWatchSeconds / 60) > 0
                                  ? `${Math.floor(video.minWatchSeconds / 60)} মিনিট`
                                  : `${video.minWatchSeconds} সেকেন্ড`}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="luxury-card flex flex-col items-center justify-center rounded-2xl p-5 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 mb-2">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-[13px] font-extrabold text-[#fff7eb]">সব ভিডিও দেখা সম্পন্ন হয়েছে! 🎉</p>
                <p className="mt-1 text-[11px] text-amber-100/65 leading-snug">
                  আপনি বর্তমান সব ভিডিও দেখে ব্যালেন্সে টাকা যোগ করে নিয়েছেন। নতুন ভিডিও পাবলিশ হলে স্বয়ংক্রিয়ভাবে এখানে দেখতে পাবেন!
                </p>
              </div>
            )}
          </section>
        );
      })()}
      </div>
    </main>
  );
}
