'use client';

import { useEffect, useState } from 'react';

type Tweet = {
  id: number;
  user_id: number;
  body: string;
  like_count: number;
  created_at: string;
};

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/users/2/timeline')
      .then((res) => res.json())
      .then((data) => {
        setTweets(data.data);
        setLoading(false);
      });
  }, []);

  async function handleLike(tweetId: number) {
    const res = await fetch(`http://127.0.0.1:8000/api/tweets/${tweetId}/like`, {
      method: 'POST',
    });
    const data = await res.json();

    setTweets((current) =>
      current.map((tweet) =>
        tweet.id === tweetId ? { ...tweet, like_count: data.like_count } : tweet
      )
    );
  }

  if (loading) return <main className="p-8">Loading...</main>;

  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Pulse</h1>
      {tweets.map((tweet) => (
        <div key={tweet.id} className="border-b py-3">
          <p className="text-sm text-gray-500">User {tweet.user_id}</p>
          <p>{tweet.body}</p>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => handleLike(tweet.id)}
              className="text-sm text-blue-500 hover:underline"
            >
              Like
            </button>
            <p className="text-sm text-gray-400">{tweet.like_count} likes</p>
          </div>
        </div>
      ))}
    </main>
  );
}