
# models.py
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone
import cv2

from django.conf import settings
from .storage import OverwriteStorage
# models.py
import uuid

from django.db import models

                                              
# models.py
import cv2

from django.conf import settings
from .storage import OverwriteStorage
# models.py

from django.db import models



class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields): 
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        # Pop conflicting fields AbstractUser sets automatically
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        extra_fields.setdefault('is_active', True)
        
        # Create user instance
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
            
        return self.create_user(email, password, **extra_fields)



class User(AbstractUser):
    ROLE_CHOICES = [
        ('clinician', 'Clinician'),
        ('admin', 'Admin'),
    ]
    username = models.CharField(max_length=150, unique=True)
    first_name = models.CharField(max_length=30, default='')
    last_name = models.CharField(max_length=30, default='')
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='clinician')

    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(null=True, blank=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    
    
    groups = models.ManyToManyField(
        'auth.Group',
        related_name='user_set',  # Default name, avoids clash
        blank=True,
        help_text='The groups this user belongs to.',
        verbose_name='groups',
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='user_set',  # Default name, avoids clash
        blank=True,
        help_text='Specific permissions for this user.',
        verbose_name='user permissions',
    )
    
    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return f"{self.username} ({self.role})"



class Horse(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="horses",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    breed = models.CharField(max_length=120, blank=True, default="")
    colour = models.CharField(max_length=120, blank=True, default="")
    age = models.PositiveIntegerField(null=True, blank=True)
    owner = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name



    

class AnalysisSession(models.Model):
    TRACKING_MODE_CHOICES = [
        ("yolo26", "YOLO26 Pose"),
        ("classical", "Classical"),
    ]

    CLASSICAL_SUBMODE_CHOICES = [
        ("markerless", "Markerless"),
        ("markers", "Markers"),
    ]

    STATUS_CHOICES = [
        ("uploaded", "Uploaded"),
        ("processing", "Processing"),
        ("done", "Done"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="analysis_sessions")
    horse_name = models.CharField(max_length=255, blank=True, default="")
    horse = models.ForeignKey(Horse, on_delete=models.CASCADE, related_name="sessions")
    gait = models.CharField(max_length=30, blank=True, default="Trot")
    notes = models.TextField(blank=True, default="")

    video = models.FileField(upload_to="uploads/videos/")
    original_filename = models.CharField(max_length=255)
    annotated_video = models.FileField(upload_to="annotated_videos/", blank=True, null=True)

    tracking_mode = models.CharField(
        max_length=20,
        choices=TRACKING_MODE_CHOICES,
        default="yolo26",
    )
    classical_submode = models.CharField(
        max_length=20,
        choices=CLASSICAL_SUBMODE_CHOICES,
        null=True,
        blank=True,
        default=None,
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="uploaded")
    progress = models.PositiveSmallIntegerField(default=0)
    current_step = models.CharField(max_length=255, blank=True)
    error_message = models.TextField(blank=True)
    celery_task_id = models.CharField(max_length=255, blank=True)

    orientation = models.CharField(max_length=50, blank=True, default="unknown")
    visible_side = models.CharField(max_length=20, blank=True, default="unknown")
    fps = models.FloatField(default=30.0)
    total_frames = models.PositiveIntegerField(default=0)

    quality_score = models.FloatField(null=True, blank=True)
    symmetry_index = models.FloatField(null=True, blank=True)
    narrative_report = models.TextField(blank=True)

    poll_rom_norm = models.FloatField(null=True, blank=True)
    wither_rom_norm = models.FloatField(null=True, blank=True)
    pelvis_rom_norm = models.FloatField(null=True, blank=True)
    pelvis_roll_mean_abs_norm = models.FloatField(null=True, blank=True)
    fore_protraction_asymmetry_deg = models.FloatField(null=True, blank=True)
    hind_protraction_asymmetry_deg = models.FloatField(null=True, blank=True)
    summary_metrics = models.JSONField(default=dict, blank=True)

    manual_start_frame = models.PositiveIntegerField(null=True, blank=True)
    manual_keypoints_norm = models.JSONField(default=list, blank=True)
    manual_keyframes_norm = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)



class SessionAngleFrameTrackingMixin(models.Model):
    tracking_source = models.CharField(max_length=20, blank=True, default="yolo26")
    keypoint_confidences = models.JSONField(default=list, blank=True)
    keypoint_tracking_meta = models.JSONField(default=dict, blank=True)

    class Meta:
        abstract = True


class SessionAngleFrame(models.Model):
    session = models.ForeignKey(
        AnalysisSession,
        on_delete=models.CASCADE,
        related_name="frames",
    )
    frame_index = models.PositiveIntegerField()
    timestamp_sec = models.FloatField()

    keypoints_norm = models.JSONField(default=list, blank=True)
    bbox_xyxy_norm = models.JSONField(default=list, blank=True)

    frame_quality_score = models.FloatField(null=True, blank=True)
    orientation = models.CharField(max_length=50, blank=True, default="unknown")
    visible_side = models.CharField(max_length=20, blank=True, default="unknown")
    left_hip_angle_deg = models.FloatField(null=True, blank=True)
    left_stifle_angle_deg = models.FloatField(null=True, blank=True)
    left_hock_angle_deg = models.FloatField(null=True, blank=True)
    left_hind_fetlock_angle_deg = models.FloatField(null=True, blank=True)
    left_shoulder_angle_deg = models.FloatField(null=True, blank=True)
    left_elbow_angle_deg = models.FloatField(null=True, blank=True)
    left_knee_angle_deg = models.FloatField(null=True, blank=True)
    left_fore_fetlock_angle_deg = models.FloatField(null=True, blank=True)
    right_hip_angle_deg = models.FloatField(null=True, blank=True)
    right_stifle_angle_deg = models.FloatField(null=True, blank=True)
    right_hock_angle_deg = models.FloatField(null=True, blank=True)
    right_hind_fetlock_angle_deg = models.FloatField(null=True, blank=True)
    right_shoulder_angle_deg = models.FloatField(null=True, blank=True)
    right_elbow_angle_deg = models.FloatField(null=True, blank=True)
    right_knee_angle_deg = models.FloatField(null=True, blank=True)
    right_fore_fetlock_angle_deg = models.FloatField(null=True, blank=True)
    left_hind_protraction_signed_deg = models.FloatField(null=True, blank=True)
    left_fore_protraction_signed_deg = models.FloatField(null=True, blank=True)
    right_hind_protraction_signed_deg = models.FloatField(null=True, blank=True)
    right_fore_protraction_signed_deg = models.FloatField(null=True, blank=True)
    left_hind_protraction_deg = models.FloatField(null=True, blank=True)
    left_fore_protraction_deg = models.FloatField(null=True, blank=True)
    right_hind_protraction_deg = models.FloatField(null=True, blank=True)
    right_fore_protraction_deg = models.FloatField(null=True, blank=True)
    poll_y_norm = models.FloatField(null=True, blank=True)
    wither_y_norm = models.FloatField(null=True, blank=True)
    pelvis_mid_y_norm = models.FloatField(null=True, blank=True)
    head_mid_y_norm = models.FloatField(null=True, blank=True)
    left_pelvis_y_norm = models.FloatField(null=True, blank=True)
    right_pelvis_y_norm = models.FloatField(null=True, blank=True)
    pelvis_roll_diff_norm = models.FloatField(null=True, blank=True)
    tail_base_y_norm = models.FloatField(null=True, blank=True)
    metrics_json = models.JSONField(default=dict, blank=True)

    tracking_source = models.CharField(max_length=20, blank=True, default="yolo26")
    keypoint_confidences = models.JSONField(default=list, blank=True)
    keypoint_tracking_meta = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["frame_index"]
        unique_together = [("session", "frame_index")]


