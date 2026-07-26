import React, { useState } from 'react';
import {
  Activity,
  Shield,
  Heart,
  Brain,
  ChevronRight,
  User,
  Lock,
  Loader2
} from 'lucide-react';
import { motion } from 'motion/react';
import api from '../api';
import { ACCESS_TOKEN, REFRESH_TOKEN } from '../constants';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = { email, password };

      const res = await api.post('/api/token', payload);

      localStorage.setItem(ACCESS_TOKEN, res.data.access);
      localStorage.setItem(REFRESH_TOKEN, res.data.refresh);

      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      setError(
        error.response?.data?.message ||
        'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        ></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-12">
        <div className="max-w-6xl w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl">
                  <Activity className="w-9 h-9 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">Equine Analytics</h1>
                  <p className="text-blue-300 text-sm">Equine Body Monitoring Platform</p>
                </div>
              </div>

              <div className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="flex items-start gap-3 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10"
                >
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Heart className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Real-Time Biomechanics</h3>
                    <p className="text-sm text-slate-400">
                    Equine gait analytics with detailed joint loading and hoof impact tracking.
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="flex items-start gap-3 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10"
                >
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Brain className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">AI-Powered Analytics</h3>
                    <p className="text-sm text-slate-400">
                      Advanced video analytics detect gait patterns, behavioral cues, and movement anomalies to optimize horse performance.
                    </p>
                  </div>
                </motion.div>

                
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl p-8 lg:p-10"
            >
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h3>
                <p className="text-slate-600">Sign in to access your dashboard</p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      placeholder="Enter your email"
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      placeholder=""
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-blue-400 disabled:to-blue-500"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing In...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}