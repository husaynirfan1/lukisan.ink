import { supabase } from './supabase';
import { checkVideoStatus, TaskStatusResponse } from './piapi';
import toast from 'react-hot-toast';

// Constants for configuration
const MAX_RETRIES = 3;
const INITIAL_POLL_INTERVAL = 10000; // 10 seco 