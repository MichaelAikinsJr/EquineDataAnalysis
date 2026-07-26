from django.contrib import admin
from django.urls import include, path
from users.views import CreateUserView, SecureTokenView, current_user
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.routers import DefaultRouter
from django.conf import settings
from django.conf.urls.static import static

router = DefaultRouter()
# router.register(r'analyses', AnalysisViewSet, basename='analysis')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/user/register/', CreateUserView.as_view(), name='register'),
    # path('api/token', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token', SecureTokenView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/user/', current_user, name='current_user'),
    path('api-auth/', include('rest_framework.urls')),
    path('api/', include('users.urls')),
    path('api/', include(router.urls)),
    
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)





